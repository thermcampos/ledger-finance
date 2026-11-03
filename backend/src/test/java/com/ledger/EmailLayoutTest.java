package com.ledger;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.email.EmailPalette;
import io.quarkus.qute.Engine;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

/** The base email layout renders its slots with the light palette. */
@QuarkusTest
class EmailLayoutTest {

  @Inject Engine engine;

  @Test
  void layoutRendersSlotsWithLightPalette() {
    String html =
        engine
            .parse(
                "{#include email/layout}"
                    + "{#title}Budgets for Tue, Nov 3{/title}"
                    + "{#preheader}Groceries is near its limit{/preheader}"
                    + "<p>BODY-MARKER</p>"
                    + "{#footer}FOOTER-MARKER{/footer}"
                    + "{/include}")
            .render();

    assertTrue(html.contains("<title>Budgets for Tue, Nov 3</title>"), html);
    assertTrue(html.contains("Groceries is near its limit"));
    assertTrue(html.contains("<p>BODY-MARKER</p>"));
    assertTrue(html.contains("FOOTER-MARKER"));
    assertTrue(html.contains("background-color:" + EmailPalette.BG));
    assertTrue(html.contains("1px solid " + EmailPalette.BORDER));
    assertFalse(html.contains("box-shadow"));
    assertFalse(html.contains("{palette:"), "unresolved palette expression");
  }
}
