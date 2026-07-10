package com.ledger.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** Minimal hand-written request shape for POST /v1/messages — only the fields PdfImportService needs. */
public class AnthropicMessageRequest {

    public String model;

    @JsonProperty("max_tokens")
    public int maxTokens;

    public String system;

    public List<Message> messages;

    public AnthropicMessageRequest() {
    }

    public AnthropicMessageRequest(String model, int maxTokens, String system, List<Message> messages) {
        this.model = model;
        this.maxTokens = maxTokens;
        this.system = system;
        this.messages = messages;
    }

    public static class Message {
        public String role;
        public List<ContentBlock> content;

        public Message() {
        }

        public Message(String role, List<ContentBlock> content) {
            this.role = role;
            this.content = content;
        }
    }

    public static class ContentBlock {
        public String type;
        public String text;
        public Source source;

        public static ContentBlock text(String text) {
            ContentBlock block = new ContentBlock();
            block.type = "text";
            block.text = text;
            return block;
        }

        public static ContentBlock document(String base64Pdf) {
            ContentBlock block = new ContentBlock();
            block.type = "document";
            block.source = new Source("base64", "application/pdf", base64Pdf);
            return block;
        }
    }

    public static class Source {
        public String type;

        @JsonProperty("media_type")
        public String mediaType;

        public String data;

        public Source() {
        }

        public Source(String type, String mediaType, String data) {
            this.type = type;
            this.mediaType = mediaType;
            this.data = data;
        }
    }
}
