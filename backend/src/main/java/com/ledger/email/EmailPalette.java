package com.ledger.email;

import io.quarkus.qute.TemplateData;

/**
 * Email colors — the app's LIGHT (paper) palette, because email clients mangle dark backgrounds
 * (docs/adr/0002-transactional-email-via-resend.md).
 *
 * <p>KEEP IN SYNC with {@code [data-theme='light']} in {@code frontend/src/styles/_themes.scss}.
 * This is the one accepted exception to "all colors come from the tokens": the SCSS isn't reachable
 * from the backend. If a light token below changes there, change it here in the same PR.
 *
 * <p>Templates read these as {@code {palette:JADE}}. Solid hex only — the {@code -dim} rgba tokens
 * are left out because Outlook drops rgba.
 */
@TemplateData(namespace = "palette")
public final class EmailPalette {

  public static final String BG = "#f3efe6"; // --bg
  public static final String SURFACE = "#faf7f0"; // --surface
  public static final String SURFACE_2 = "#e9e3d5"; // --surface-2 (progress-bar track)
  public static final String BORDER = "#c9c1a9"; // --border (hairlines)
  public static final String BORDER_STRONG = "#b0a78f"; // --border-strong
  public static final String TEXT = "#211d16"; // --text
  public static final String TEXT_MUTED = "#5a5445"; // --text-muted
  public static final String TEXT_FAINT = "#655f4f"; // --text-faint
  public static final String JADE = "#1f6d54"; // --jade — positive / On track
  public static final String RED = "#b03a36"; // --red — negative / Over budget
  public static final String GOLD = "#7e6113"; // --gold — "Near limit" ONLY

  /** Figures: monospace, right-aligned, tabular (tokens.scss $font-family-monospace). */
  public static final String FONT_MONO =
      "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  /** Labels and body copy (tokens.scss $font-family-sans-serif). Fraunces is not used in email. */
  public static final String FONT_SANS =
      "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  private EmailPalette() {}
}
