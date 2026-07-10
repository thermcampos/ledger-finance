package com.ledger.transaction;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * No header-name aliases — banks don't agree on column names, so columns are
 * classified by the shape of their sampled values instead: a fixed-length
 * date pattern for the date column, "parses as a number once currency
 * symbols/separators are stripped" for the amount column(s), and the
 * remaining column with the longest average value for description.
 */
@ApplicationScoped
public class CsvImportService {

    private static final int SAMPLE_SIZE = 20;

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
    };

    public List<ParsedImportRow> parse(InputStream in) {
        List<List<String>> rows = readRows(in);
        if (rows.isEmpty()) {
            throw new WebApplicationException("CSV file is empty", 400);
        }

        int columnCount = rows.get(0).size();
        // Sample from row 1 on, assuming a header row exists; if the file
        // has no header (only one row, or too few rows to sample past it)
        // fall back to sampling everything.
        List<List<String>> sample = rows.size() > 1
                ? rows.subList(1, Math.min(rows.size(), 1 + SAMPLE_SIZE))
                : rows;

        Integer dateCol = null;
        DateTimeFormatter dateFormat = null;
        for (DateTimeFormatter format : DATE_FORMATS) {
            for (int c = 0; c < columnCount; c++) {
                if (isDateColumn(sample, c, format)) {
                    dateCol = c;
                    dateFormat = format;
                    break;
                }
            }
            if (dateCol != null) {
                break;
            }
        }
        if (dateCol == null) {
            throw new WebApplicationException(
                    "Couldn't find a date column. Header row: " + rows.get(0), 400);
        }

        List<Integer> amountCols = new ArrayList<>();
        for (int c = 0; c < columnCount; c++) {
            if (c != dateCol && isAmountColumn(sample, c)) {
                amountCols.add(c);
            }
        }
        if (amountCols.isEmpty()) {
            throw new WebApplicationException(
                    "Couldn't find an amount column. Header row: " + rows.get(0), 400);
        }

        int descCol = pickDescriptionColumn(sample, columnCount, dateCol, amountCols);

        // Row 0 counts as a header (excluded from output) unless it parses
        // as data itself — same shape tests, applied to just that one row.
        boolean hasHeader = rows.size() > 1 && !(
                isDateColumn(List.of(rows.get(0)), dateCol, dateFormat)
                        && amountCols.stream().allMatch(c -> parseAmount(rows.get(0).get(c)) != null || rows.get(0).get(c).isBlank()));

        List<ParsedImportRow> result = new ArrayList<>();
        for (int r = hasHeader ? 1 : 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            LocalDate date;
            try {
                date = LocalDate.parse(row.get(dateCol).trim(), dateFormat);
            } catch (DateTimeParseException e) {
                continue; // skip malformed row rather than fail the whole import
            }

            BigDecimal amount = mergeAmount(row, amountCols);
            if (amount == null) {
                continue;
            }

            String description = descCol >= 0 ? row.get(descCol).trim() : "";
            result.add(new ParsedImportRow(description, date, amount));
        }

        result.sort((a, b) -> a.occurredOn.compareTo(b.occurredOn));
        return result;
    }

    private List<List<String>> readRows(InputStream in) {
        String content;
        try {
            content = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new WebApplicationException("Couldn't read the uploaded file", 400);
        }

        char delimiter = detectDelimiter(content);
        List<List<String>> rows = new ArrayList<>();
        try (CSVParser parser = CSVFormat.DEFAULT.builder()
                .setDelimiter(delimiter)
                .setIgnoreSurroundingSpaces(true)
                .setTrim(true)
                .build()
                .parse(new StringReader(content))) {
            for (CSVRecord record : parser) {
                List<String> row = new ArrayList<>(record.size());
                record.forEach(row::add);
                if (!row.isEmpty() && row.stream().anyMatch(s -> !s.isBlank())) {
                    rows.add(row);
                }
            }
        } catch (IOException e) {
            throw new WebApplicationException("Couldn't parse CSV: " + e.getMessage(), 400);
        }
        return rows;
    }

    private char detectDelimiter(String content) {
        String firstLine = content.lines().findFirst().orElse("");
        char[] candidates = {',', ';', '\t'};
        char best = ',';
        long bestCount = -1;
        for (char c : candidates) {
            long count = firstLine.chars().filter(ch -> ch == c).count();
            if (count > bestCount) {
                bestCount = count;
                best = c;
            }
        }
        return best;
    }

    private boolean isDateColumn(List<List<String>> sample, int col, DateTimeFormatter format) {
        boolean sawAny = false;
        for (List<String> row : sample) {
            if (col >= row.size()) {
                return false;
            }
            String value = row.get(col).trim();
            if (value.isBlank()) {
                return false;
            }
            try {
                LocalDate.parse(value, format);
                sawAny = true;
            } catch (DateTimeParseException e) {
                return false;
            }
        }
        return sawAny;
    }

    private boolean isAmountColumn(List<List<String>> sample, int col) {
        boolean sawAny = false;
        for (List<String> row : sample) {
            if (col >= row.size()) {
                return false;
            }
            String value = row.get(col).trim();
            if (value.isBlank()) {
                continue; // debit/credit-style columns are often blank on the other side
            }
            if (parseAmount(value) == null) {
                return false;
            }
            sawAny = true;
        }
        return sawAny;
    }

    private int pickDescriptionColumn(List<List<String>> sample, int columnCount, int dateCol, List<Integer> amountCols) {
        int best = -1;
        double bestAvgLen = -1;
        for (int c = 0; c < columnCount; c++) {
            if (c == dateCol || amountCols.contains(c)) {
                continue;
            }
            double totalLen = 0;
            int count = 0;
            for (List<String> row : sample) {
                if (c < row.size()) {
                    totalLen += row.get(c).trim().length();
                    count++;
                }
            }
            double avg = count > 0 ? totalLen / count : 0;
            if (avg > bestAvgLen) {
                bestAvgLen = avg;
                best = c;
            }
        }
        return best;
    }

    /**
     * Single amount column: use as-is. Two+ amount columns: treat as
     * debit/credit pair (leftmost = debit → negative, next = credit →
     * positive) — the common shape for bank exports that split the sign
     * into separate columns with a blank cell on the side that doesn't apply.
     */
    private BigDecimal mergeAmount(List<String> row, List<Integer> amountCols) {
        if (amountCols.size() == 1) {
            return parseAmount(row.get(amountCols.get(0)));
        }
        BigDecimal debit = parseAmount(row.get(amountCols.get(0)));
        BigDecimal credit = parseAmount(row.get(amountCols.get(1)));
        if (debit != null) {
            return debit.signum() > 0 ? debit.negate() : debit;
        }
        if (credit != null) {
            return credit.abs();
        }
        return null;
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            return null;
        }
        boolean parenNegative = s.startsWith("(") && s.endsWith(")");
        if (parenNegative) {
            s = s.substring(1, s.length() - 1);
        }
        s = s.replaceAll("[^0-9,.+-]", "");
        if (s.isEmpty() || s.equals("-") || s.equals("+")) {
            return null;
        }

        int lastComma = s.lastIndexOf(',');
        int lastDot = s.lastIndexOf('.');
        String normalized;
        if (lastComma > lastDot) {
            normalized = s.replace(".", "").replace(",", ".");
        } else if (lastDot > lastComma) {
            normalized = s.replace(",", "");
        } else {
            normalized = s;
        }

        try {
            BigDecimal value = new BigDecimal(normalized);
            return parenNegative ? value.negate() : value;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
