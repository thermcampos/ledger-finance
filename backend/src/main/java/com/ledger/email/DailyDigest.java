package com.ledger.email;

import com.ledger.dto.response.BudgetSummaryResponse;
import com.ledger.enums.BudgetStatus;
import io.quarkus.qute.TemplateData;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Everything the daily digest email shows, already formatted — built from the same {@link
 * BudgetSummaryResponse} the Budgets page renders, so the numbers match it exactly. Pure: no
 * database, no clock, so the templates can be snapshot-tested.
 *
 * @param yesterdayLabel "Yesterday", or "Yesterday, Oct 31" on the 1st (it's last month's day)
 * @param test sent from Profile's "Send test email" rather than the schedule
 */
@TemplateData
public record DailyDigest(
    LocalDate today,
    String subject,
    String preheader,
    String dateLabel,
    int daysLeft,
    String perDayLabel,
    String yesterdayLabel,
    boolean test,
    String profileUrl,
    List<Line> lines) {

  /** Shown instead of a per-day figure when nothing is left. */
  public static final String OVER_BUDGET_TEXT = "Over budget";

  private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);
  private static final DateTimeFormatter SHORT = DateTimeFormatter.ofPattern("MMM d", Locale.US);

  /** Order: Over budget → Near limit → On track, then by category name. */
  private static final Comparator<Line> ORDER =
      Comparator.comparingInt((Line l) -> rank(l.status()))
          .thenComparing(Line::categoryName, String.CASE_INSENSITIVE_ORDER);

  /**
   * One flagged budget.
   *
   * @param perDay {@code left / daysLeft}, or "Over budget" when nothing is left
   * @param perDayAvailable false when {@code perDay} holds "Over budget" rather than a figure
   * @param overspent {@code left < 0} — shown in red, like the Budgets card
   * @param yesterday signed spend on {@code today − 1} ("-$5.00" for a net refund)
   * @param percent spent / limit, clamped to 0–100 — the progress bar fill
   */
  @TemplateData
  public record Line(
      String categoryName,
      BudgetStatus status,
      String statusLabel,
      String statusColor,
      String spent,
      String limit,
      String left,
      boolean overspent,
      String perDay,
      boolean perDayAvailable,
      String yesterday,
      int percent) {}

  /**
   * @param summary this month's summary for the user (today included in its spend)
   * @param flaggedBudgetIds budgets marked "Daily email summary"
   * @param yesterdaySpent spend on {@code today − 1} per category id (positive = spent)
   * @return empty when no budget in the summary is flagged — no email is sent then
   */
  public static Optional<DailyDigest> of(
      BudgetSummaryResponse summary,
      Collection<Long> flaggedBudgetIds,
      Map<Long, BigDecimal> yesterdaySpent,
      boolean test,
      String profileUrl) {
    List<Line> lines =
        summary.budgets().stream()
            .filter(b -> flaggedBudgetIds.contains(b.budgetId()))
            .map(b -> line(b, yesterdaySpent.getOrDefault(b.categoryId(), BigDecimal.ZERO)))
            .sorted(ORDER)
            .toList();
    if (lines.isEmpty()) {
      return Optional.empty();
    }

    LocalDate today = summary.today();
    String dateLabel = DAY.format(today);
    String subject = "Ledger · Budgets for " + dateLabel + (test ? " (test)" : "");
    String yesterdayLabel =
        today.getDayOfMonth() == 1 ? "Yesterday, " + SHORT.format(today.minusDays(1)) : "Yesterday";

    return Optional.of(
        new DailyDigest(
            today,
            subject,
            preheader(lines),
            dateLabel,
            summary.daysLeft(),
            "Per day ×" + summary.daysLeft(),
            yesterdayLabel,
            test,
            profileUrl,
            lines));
  }

  private static Line line(BudgetSummaryResponse.Item b, BigDecimal yesterday) {
    return new Line(
        b.categoryName(),
        b.status(),
        b.status().label(),
        color(b.status()),
        Money.abs(b.spent()),
        Money.abs(b.limit()),
        Money.signed(b.left()),
        b.left().signum() < 0,
        b.perDay() == null ? OVER_BUDGET_TEXT : Money.abs(b.perDay()),
        b.perDay() != null,
        Money.signed(yesterday),
        percent(b.spent(), b.limit()));
  }

  /** Same clamp as the Budgets card's track width. */
  static int percent(BigDecimal spent, BigDecimal limit) {
    if (limit.signum() <= 0) {
      return spent.signum() > 0 ? 100 : 0;
    }
    int pct =
        spent.multiply(BigDecimal.valueOf(100)).divide(limit, 0, RoundingMode.FLOOR).intValue();
    return Math.max(0, Math.min(100, pct));
  }

  private static String color(BudgetStatus status) {
    return switch (status) {
      case ON_TRACK -> EmailPalette.JADE;
      case NEAR_LIMIT -> EmailPalette.GOLD;
      case OVER_BUDGET -> EmailPalette.RED;
    };
  }

  private static int rank(BudgetStatus status) {
    return switch (status) {
      case OVER_BUDGET -> 0;
      case NEAR_LIMIT -> 1;
      case ON_TRACK -> 2;
    };
  }

  /** Inbox preview line, e.g. "1 over budget · 2 on track". */
  private static String preheader(List<Line> lines) {
    StringBuilder out = new StringBuilder();
    for (BudgetStatus s : List.of(BudgetStatus.OVER_BUDGET, BudgetStatus.NEAR_LIMIT, BudgetStatus.ON_TRACK)) {
      long n = lines.stream().filter(l -> l.status() == s).count();
      if (n > 0) {
        if (!out.isEmpty()) {
          out.append(" · ");
        }
        out.append(n).append(' ').append(s.label().toLowerCase(Locale.ROOT));
      }
    }
    return out.toString();
  }
}
