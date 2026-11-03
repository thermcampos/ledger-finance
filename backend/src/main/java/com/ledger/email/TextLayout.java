package com.ledger.email;

import io.quarkus.qute.TemplateExtension;

/**
 * Column helpers for plain-text emails, used as {@code {txt:cell('Spent', line.spent)}}. Figures
 * are right-aligned so the digits line up in a monospace client — the text-email version of the
 * ledger rule.
 */
@TemplateExtension(namespace = "txt")
public final class TextLayout {

  /** Width of the whole text email; a row holds two cells and a gap. */
  public static final int ROW = 56;

  static final int CELL = 26;
  static final int BAR = 20;

  private TextLayout() {}

  /** Label left, value right, {@value #CELL} wide (wider if both don't fit with one space). */
  public static String cell(String label, String value) {
    return justify(label, value, CELL);
  }

  /** Two cells separated by the remaining gap — one full row. */
  public static String pair(String label1, String value1, String label2, String value2) {
    return cell(label1, value1) + " ".repeat(ROW - 2 * CELL) + cell(label2, value2);
  }

  /** Name left, status right, full row width. */
  public static String row(String left, String right) {
    return justify(left, right, ROW);
  }

  /** {@code [█████████████████░░░]} for a 0–100 fill. */
  public static String bar(int percent) {
    int filled = Math.round(Math.max(0, Math.min(100, percent)) * BAR / 100f);
    return "[" + "█".repeat(filled) + "░".repeat(BAR - filled) + "]";
  }

  private static String justify(String left, String right, int width) {
    int gap = Math.max(1, width - left.length() - right.length());
    return left + " ".repeat(gap) + right;
  }
}
