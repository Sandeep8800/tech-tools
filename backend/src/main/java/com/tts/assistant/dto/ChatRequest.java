package com.tts.assistant.dto;

import lombok.Data;
import java.util.List;

@Data
public class ChatRequest {
    private String provider; // "openai", "ollama", "anthropic", "google-ai"
    private String model;
    private List<ChatMessage> messages;
    private String systemPrompt;
    private Double temperature;
    
    // Dynamic settings from client (optional overrides)
    private String apiKey;
    private String baseUrl;
}
