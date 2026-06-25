package com.tts.assistant.controller;

import com.tts.assistant.dto.ChatMessage;
import com.tts.assistant.dto.ChatRequest;
import com.tts.assistant.dto.ModelDto;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.google.GoogleAiGeminiChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;

@RestController
@CrossOrigin(origins = "*")
public class ChatController {

    @Autowired(required = false)
    private OpenAiChatModel openAiChatModel;

    @Autowired(required = false)
    private OllamaChatModel ollamaChatModel;

    @Autowired(required = false)
    private AnthropicChatModel anthropicChatModel;

    @Autowired(required = false)
    private GoogleAiGeminiChatModel googleAiGeminiChatModel;

    @GetMapping("/api/health")
    public String health() {
        return "TTS Assistant Spring Boot Backend is Online!";
    }

    @GetMapping("/api/models")
    public List<ModelDto> listModels() {
        List<ModelDto> list = new ArrayList<>();

        // Add Ollama models if Ollama bean is configured
        boolean ollamaActive = ollamaChatModel != null;
        list.add(new ModelDto("qwen3:30b", "Qwen 3 (Ollama)", "ollama", ollamaActive));
        list.add(new ModelDto("llama3:8b", "Llama 3 (Ollama)", "ollama", ollamaActive));
        list.add(new ModelDto("phi3:medium", "Phi 3 (Ollama)", "ollama", ollamaActive));

        // Add OpenAI models if bean is configured
        boolean openaiActive = openAiChatModel != null;
        list.add(new ModelDto("gpt-4o", "GPT-4o (OpenAI)", "openai", openaiActive));
        list.add(new ModelDto("gpt-4o-mini", "GPT-4o Mini (OpenAI)", "openai", openaiActive));
        list.add(new ModelDto("gpt-4", "GPT-4 (OpenAI)", "openai", openaiActive));

        // Add Anthropic models if bean is configured
        boolean anthropicActive = anthropicChatModel != null;
        list.add(new ModelDto("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet", "anthropic", anthropicActive));
        list.add(new ModelDto("claude-3-5-haiku-20241022", "Claude 3.5 Haiku", "anthropic", anthropicActive));

        // Add Gemini models if bean is configured
        boolean geminiActive = googleAiGeminiChatModel != null;
        list.add(new ModelDto("gemini-1.5-pro", "Gemini 1.5 Pro", "google-ai", geminiActive));
        list.add(new ModelDto("gemini-1.5-flash", "Gemini 1.5 Flash", "google-ai", geminiActive));

        return list;
    }

    @PostMapping(value = "/api/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> streamChat(@RequestBody ChatRequest request) {
        ChatModel chatModel = selectChatModel(request.getProvider());

        if (chatModel == null) {
            return Flux.just("Error: Selected provider [" + request.getProvider() + 
                    "] is not active or configured in the Spring Boot application properties.");
        }

        try {
            // Build Spring AI messages
            List<Message> springMessages = new ArrayList<>();

            // Add system prompt if present
            if (request.getSystemPrompt() != null && !request.getSystemPrompt().trim().isEmpty()) {
                springMessages.add(new SystemMessage(request.getSystemPrompt()));
            }

            // Convert chat history
            for (ChatMessage msg : request.getMessages()) {
                if ("user".equalsIgnoreCase(msg.getRole())) {
                    springMessages.add(new UserMessage(msg.getContent()));
                } else if ("assistant".equalsIgnoreCase(msg.getRole())) {
                    springMessages.add(new AssistantMessage(msg.getContent()));
                } else if ("system".equalsIgnoreCase(msg.getRole())) {
                    springMessages.add(new SystemMessage(msg.getContent()));
                }
            }

            Prompt prompt = new Prompt(springMessages);

            // Stream and map to token content strings
            return chatModel.stream(prompt)
                    .map(response -> {
                        if (response.getResult() != null && response.getResult().getOutput() != null) {
                            String content = response.getResult().getOutput().getContent();
                            return content != null ? content : "";
                        }
                        return "";
                    })
                    .filter(text -> !text.isEmpty())
                    .onErrorResume(throwable -> {
                        return Flux.just("\n[Spring AI Error]: " + throwable.getMessage());
                    });

        } catch (Exception e) {
            return Flux.just("\n[Spring Boot Exception]: " + e.getMessage());
        }
    }

    private ChatModel selectChatModel(String provider) {
        if (provider == null) return null;
        switch (provider.toLowerCase()) {
            case "openai":
                return openAiChatModel;
            case "ollama":
                return ollamaChatModel;
            case "anthropic":
                return anthropicChatModel;
            case "google-ai":
            case "gemini":
                return googleAiGeminiChatModel;
            default:
                return null;
        }
    }
}
