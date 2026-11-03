package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.dto.response.BudgetSummaryResponse;
import com.ledger.email.DailyDigest;
import com.ledger.enums.BudgetStatus;
import com.ledger.service.DailyDigestService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The digest's text variant, compared to {@code src/test/resources/snapshots/daily-digest/*.txt}.
 * After an intended change, regenerate with {@code ./mvnw test -Dtest=DailyDigestSnapshotTest
 * -Dsnapshots.update=true} and review the diff.
 */
@QuarkusTest
class DailyDigestSnapshotTest {

  private static final Path SNAPSHOTS = Path.of("src/test/resources/snapshots/daily-digest");
  private static final String PROFILE = "https://ledger.example/profile";

  @Inject DailyDigestService digestService;

  /** One budget as the summary endpoint would return it, for a given "today". */
  private static BudgetSummaryResponse.Item item(
      long id, String name, String limit, String spent, int daysLeft) {
    BigDecimal l = new BigDecimal(limit);
    BigDecimal s = new BigDecimal(spent);
    BigDecimal left = l.subtract(s);
    BigDecimal perDay =
        left.signum() > 0 ? left.divide(BigDecimal.valueOf(daysLeft), 2, RoundingMode.HALF_UP) : null;
    return new BudgetSummaryResponse.Item(
        id, id * 10, name, l, s, left, BudgetStatus.of(s, l), perDay);
  }

  private static int daysLeft(LocalDate today) {
    return (int) ChronoUnit.DAYS.between(today, YearMonth.from(today).atEndOfMonth()) + 1;
  }

  private String render(
      LocalDate today, List<String[]> budgets, Map<Long, BigDecimal> yesterday, boolean test) {
    int daysLeft = daysLeft(today);
    List<BudgetSummaryResponse.Item> items = new ArrayList<>();
    for (int i = 0; i < budgets.size(); i++) {
      String[] b = budgets.get(i);
      items.add(item(i + 1, b[0], b[1], b[2], daysLeft));
    }
    BudgetSummaryResponse summary =
        new BudgetSummaryResponse(YearMonth.from(today), today, daysLeft, items);
    Set<Long> flagged = Set.copyOf(items.stream().map(BudgetSummaryResponse.Item::budgetId).toList());
    DailyDigest digest = DailyDigest.of(summary, flagged, yesterday, test, PROFILE).orElseThrow();
    return digestService.render(digest).text();
  }

  private static void assertSnapshot(String name, String actual) throws IOException {
    Path file = SNAPSHOTS.resolve(name + ".txt");
    if (Boolean.getBoolean("snapshots.update")) {
      Files.createDirectories(SNAPSHOTS);
      Files.writeString(file, actual, StandardCharsets.UTF_8);
    }
    assertTrue(
        Files.exists(file),
        "Missing snapshot " + file + " — run with -Dsnapshots.update=true and review it");
    assertEquals(Files.readString(file, StandardCharsets.UTF_8), actual, "snapshot " + name);
  }

  @Test
  void onTrack() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 11, 3),
            List.<String[]>of(new String[] {"Dining", "600.00", "120.00"}),
            Map.of(10L, new BigDecimal("32.50")),
            false);
    assertSnapshot("on-track", text);
  }

  /** The example in docs/daily-digest.md. */
  @Test
  void nearLimit() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 11, 3),
            List.<String[]>of(new String[] {"Groceries", "2000.00", "1742.10"}),
            Map.of(10L, new BigDecimal("84.20")),
            false);
    assertTrue(text.contains("Per day ×28"), text);
    assertTrue(text.contains("$9.21"), text);
    assertSnapshot("near-limit", text);
  }

  @Test
  void overBudget() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 11, 3),
            List.<String[]>of(new String[] {"Travel", "500.00", "612.40"}),
            Map.of(),
            false);
    assertTrue(text.contains("-$112.40"), text);
    assertSnapshot("over-budget", text);
  }

  /** Days left includes today: 1 on the last day, never 0. */
  @Test
  void lastDayOfMonth() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 11, 30),
            List.<String[]>of(new String[] {"Groceries", "2000.00", "1500.00"}),
            Map.of(10L, new BigDecimal("40.00")),
            false);
    assertTrue(text.contains("Per day ×1"), text);
    assertTrue(text.contains("$500.00"), text);
    assertSnapshot("last-day-of-month", text);
  }

  /** On the 1st, "yesterday" is last month's last day and is labelled with its date. */
  @Test
  void firstOfMonth() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 12, 1),
            List.<String[]>of(new String[] {"Groceries", "2000.00", "0.00"}),
            Map.of(10L, new BigDecimal("96.30")),
            false);
    assertTrue(text.contains("Yesterday, Nov 30"), text);
    assertTrue(text.contains("Per day ×31"), text);
    assertSnapshot("first-of-month", text);
  }

  /** Over → Near → On track, then by name; a net refund yesterday shows signed; test footer. */
  @Test
  void orderingAndTestFooter() throws IOException {
    String text =
        render(
            LocalDate.of(2026, 11, 3),
            List.of(
                new String[] {"groceries", "1000.00", "100.00"},
                new String[] {"Dining", "300.00", "290.00"},
                new String[] {"Travel", "200.00", "250.00"},
                new String[] {"Books", "100.00", "10.00"}),
            Map.of(10L, new BigDecimal("-5.00")),
            true);
    assertTrue(text.indexOf("Travel") < text.indexOf("Dining"), text);
    assertTrue(text.indexOf("Dining") < text.indexOf("Books"), text);
    assertTrue(text.indexOf("Books") < text.indexOf("groceries"), text);
    assertSnapshot("ordering-test-footer", text);
  }

  /** Also writes target/digest-preview.html — open it in a browser to eyeball the layout. */
  @Test
  void htmlUsesLightPaletteAndMonospaceFigures() throws IOException {
    LocalDate today = LocalDate.of(2026, 11, 3);
    BudgetSummaryResponse summary =
        new BudgetSummaryResponse(
            YearMonth.from(today),
            today,
            28,
            List.of(
                item(1, "Groceries & Co", "2000.00", "1742.10", 28),
                item(2, "Travel", "500.00", "612.40", 28),
                item(3, "Dining", "600.00", "120.00", 28)));
    DailyDigest digest =
        DailyDigest.of(summary, Set.of(1L, 2L, 3L), Map.of(10L, new BigDecimal("84.20")), false, PROFILE)
            .orElseThrow();
    String html = digestService.render(digest).html();
    Files.writeString(Path.of("target/digest-preview.html"), html, StandardCharsets.UTF_8);

    assertTrue(html.contains("Groceries &amp; Co"), "category names are escaped");
    assertTrue(html.contains("$1,742.10"));
    assertTrue(html.contains("IBM Plex Mono"));
    assertTrue(html.contains("width=\"87%\""), "progress fill is a table cell");
    assertTrue(html.contains("href=\"" + PROFILE + "\""));
    assertFalse(html.contains("box-shadow"));
    assertFalse(html.contains("Fraunces"));
  }

  @Test
  void nothingFlaggedMeansNoDigest() {
    LocalDate today = LocalDate.of(2026, 11, 3);
    BudgetSummaryResponse summary =
        new BudgetSummaryResponse(
            YearMonth.from(today), today, 28, List.of(item(1, "Groceries", "100.00", "1.00", 28)));
    assertTrue(DailyDigest.of(summary, Set.of(), Map.of(), false, PROFILE).isEmpty());
  }
}
