package com.ledger.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledger.anthropic.AnthropicClient;
import com.ledger.anthropic.AnthropicMessageRequest;
import com.ledger.anthropic.AnthropicMessageResponse;
import com.ledger.dto.ParsedImportRow;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.rest.client.inject.RestClient;

/**
 * PDF statements have no reliable per-bank layout to parse against (Brazilian banks vary wildly),
 * so this hands the raw PDF to Claude instead of a hand-rolled parser — see PLAN-import.md for why
 * PDFBox and the Anthropic Java SDK were both ruled out.
 */
@ApplicationScoped
public class PdfImportService {

  private static final String ANTHROPIC_VERSION = "2023-06-01";
  private static final int MAX_TOKENS = 8000;
  private static final String SYSTEM_PROMPT =
      """
            You will be given a bank statement PDF. Return ONLY a JSON array of \
            transaction rows, nothing else - no prose, no markdown fences. Each \
            row: {"date": "yyyy-MM-dd", "description": "string", "amount": signed \
            decimal}. Expenses negative, income positive. Discard everything that \
            is not an individual transaction line: headers, column titles, \
            running/opening/closing balance rows, subtotals, page footers, account \
            summaries.""";

  @RestClient AnthropicClient client;

  @Inject ObjectMapper mapper;

  @ConfigProperty(name = "ledger.import.pdf.model")
  String model;

  @ConfigProperty(name = "ledger.anthropic.api-key")
  Optional<String> apiKey;

  @ConfigProperty(name = "ledger.import.pdf.enabled")
  boolean enabled;

  public List<ParsedImportRow> parse(InputStream in) {
    if (!enabled) {
      throw new WebApplicationException(
          Response.status(503)
              .entity(
                  Map.of(
                      "message", "PDF import is temporarily disabled. Try a CSV export instead."))
              .build());
    }
    if (apiKey.isEmpty() || apiKey.get().isBlank()) {
      throw new WebApplicationException(
          "PDF import isn't configured (missing ANTHROPIC_API_KEY)", 503);
    }

    byte[] bytes;
    try {
      bytes = in.readAllBytes();
    } catch (IOException e) {
      throw new WebApplicationException("Couldn't read the uploaded file", 400);
    }
    String base64 = Base64.getEncoder().encodeToString(bytes);

    AnthropicMessageRequest.Message message =
        new AnthropicMessageRequest.Message(
            "user",
            List.of(
                AnthropicMessageRequest.ContentBlock.document(base64),
                AnthropicMessageRequest.ContentBlock.text("Extract the transactions.")));
    AnthropicMessageRequest request =
        new AnthropicMessageRequest(model, MAX_TOKENS, SYSTEM_PROMPT, List.of(message));

    AnthropicMessageResponse response;
    try {
      response = client.createMessage(apiKey.get(), ANTHROPIC_VERSION, request);
    } catch (Exception e) {
      throw new WebApplicationException(
          "Couldn't reach Claude to read this PDF. Try again or use a CSV export instead.", 502);
    }

    String text =
        response.content == null
            ? null
            : response.content.stream()
                .filter(b -> "text".equals(b.type))
                .map(b -> b.text)
                .findFirst()
                .orElse(null);
    if (text == null) {
      throw new WebApplicationException("Couldn't read that PDF, try a CSV export instead", 422);
    }

    List<ExtractedRow> extracted;
    try {
      extracted = mapper.readValue(stripCodeFences(text), new TypeReference<>() {});
    } catch (IOException e) {
      throw new WebApplicationException("Couldn't read that PDF, try a CSV export instead", 422);
    }

    return extracted.stream()
        .map(r -> new ParsedImportRow(null, r.description, LocalDate.parse(r.date), r.amount))
        .sorted((a, b) -> a.occurredOn().compareTo(b.occurredOn()))
        .toList();
  }

  // Claude occasionally wraps JSON in ```json fences despite being told not to.
  private String stripCodeFences(String text) {
    String trimmed = text.trim();
    if (!trimmed.startsWith("```")) {
      return trimmed;
    }
    trimmed = trimmed.replaceFirst("^```[a-zA-Z]*\\n?", "").trim();
    if (trimmed.endsWith("```")) {
      trimmed = trimmed.substring(0, trimmed.length() - 3).trim();
    }
    return trimmed;
  }

  private static class ExtractedRow {
    public String date;
    public String description;
    public BigDecimal amount;
  }
}
