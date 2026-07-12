package com.ledger.anthropic;

import java.util.List;

/** Minimal hand-written response shape for POST /v1/messages — only the fields PdfImportService needs. */
public class AnthropicMessageResponse {

    public String id;
    public List<ContentBlock> content;

    public static class ContentBlock {
        public String type;
        public String text;
    }
}
