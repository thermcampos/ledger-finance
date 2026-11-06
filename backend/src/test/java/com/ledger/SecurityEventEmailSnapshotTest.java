package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.email.SecurityEventEmail;
import com.ledger.service.TwoFactorService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * The security-event email's text variant, compared to {@code
 * src/test/resources/snapshots/security-event/*.txt}. After an intended change, regenerate with
 * {@code ./mvnw test -Dtest=SecurityEventEmailSnapshotTest -Dsnapshots.update=true} and review the
 * diff.
 */
@QuarkusTest
class SecurityEventEmailSnapshotTest {

  private static final Path SNAPSHOTS = Path.of("src/test/resources/snapshots/security-event");
  private static final String PROFILE = "https://ledger.example/profile";

  @Inject TwoFactorService twoFactorService;

  private String render(String title, String preheader, String detail) {
    return twoFactorService
        .render(new SecurityEventEmail(title, preheader, detail, PROFILE))
        .text();
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
  void enabled() throws IOException {
    assertSnapshot(
        "enabled",
        render(
            "Two-factor authentication enabled",
            "Sign-ins now ask for a code",
            "Two-factor authentication was enabled for your account. From now on, signing in asks"
                + " for a code from your authenticator app after your password."));
  }

  @Test
  void disabled() throws IOException {
    assertSnapshot(
        "disabled",
        render(
            "Two-factor authentication disabled",
            "Sign-ins no longer ask for a code",
            "Two-factor authentication was disabled for your account. Signing in now only needs"
                + " your password."));
  }

  @Test
  void recoveryCodeUsed() throws IOException {
    assertSnapshot(
        "recovery-code-used",
        render(
            "A recovery code was used",
            "One of your recovery codes was just used to sign in",
            "A recovery code was just used to sign in to your account, and it can't be used again."
                + " If you're running low, regenerate them on your Profile page."));
  }

  /** Also writes target/security-event-preview.html — open it in a browser to eyeball the layout. */
  @Test
  void htmlUsesLightPaletteAndNoShadows() throws IOException {
    String html =
        twoFactorService
            .render(
                new SecurityEventEmail(
                    "Two-factor authentication enabled",
                    "Sign-ins now ask for a code",
                    "Two-factor authentication was enabled for your account.",
                    PROFILE))
            .html();
    Files.writeString(
        Path.of("target/security-event-preview.html"), html, StandardCharsets.UTF_8);

    assertTrue(html.contains("IBM Plex Mono") || html.contains("Inter"), html);
    assertFalse(html.contains("box-shadow"));
    assertFalse(html.contains("Fraunces"));
  }
}
