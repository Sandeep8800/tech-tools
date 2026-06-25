import { OllamaTool } from "./mcpClient";

export interface OllamaModel {
  name: string;
  details?: {
    parameter_size?: string;
    family?: string;
  };
}

export interface OllamaMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: {
    function: {
      name: string;
      arguments: any;
    };
  }[];
}

// Fallback models to show when Ollama is offline or doesn't return anything
export const FALLBACK_MODELS: OllamaModel[] = [
  { name: "qwen3:30b", details: { parameter_size: "30B", family: "qwen" } },
  { name: "qwen2.5:14b", details: { parameter_size: "14B", family: "qwen" } },
  { name: "llama3:8b", details: { parameter_size: "8B", family: "llama" } },
  { name: "deepseek-r1:14b", details: { parameter_size: "14B", family: "deepseek" } },
  { name: "mistral:7b", details: { parameter_size: "7B", family: "mistral" } }
];

export async function listOllamaModels(baseUrl: string = "/ollama"): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`HTTP error listing models: ${response.status}`);
    }
    const data = await response.json();
    return data.models && data.models.length > 0 ? data.models : FALLBACK_MODELS;
  } catch (error) {
    console.warn("[Ollama] Failed to fetch models, using fallback list:", error);
    return FALLBACK_MODELS;
  }
}

export interface ChatStreamOptions {
  baseUrl?: string;
  model: string;
  messages: OllamaMessage[];
  systemPrompt?: string;
  tools?: OllamaTool[];
  onChunk: (text: string) => void;
  onToolCallsDetected?: (toolCalls: any[]) => void;
  abortSignal?: AbortSignal;
}

export async function streamOllamaChat(options: ChatStreamOptions): Promise<{
  content: string;
  tool_calls?: any[];
}> {
  const baseUrl = options.baseUrl || "/ollama";
  const messagesToSend = [...options.messages];

  // Inject system prompt if provided
  if (options.systemPrompt) {
    const hasSystem = messagesToSend.some(m => m.role === "system");
    if (!hasSystem) {
      messagesToSend.unshift({
        role: "system",
        content: options.systemPrompt
      });
    }
  }

  const payload: any = {
    model: options.model,
    messages: messagesToSend.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls
    })),
    stream: true
  };

  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.abortSignal
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Ollama chat error (${response.status}): ${errText || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable.");
  }

  const decoder = new TextDecoder();
  let accumulatedContent = "";
  let accumulatedToolCalls: any[] = [];
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep unfinished line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          
          if (json.message) {
            // Text content
            if (json.message.content) {
              accumulatedContent += json.message.content;
              options.onChunk(json.message.content);
            }

            // Tool calls
            if (json.message.tool_calls && json.message.tool_calls.length > 0) {
              for (const tc of json.message.tool_calls) {
                // Ensure name and arguments are extracted correctly
                const tcName = tc.function?.name;
                let tcArgs = tc.function?.arguments;

                if (tcName) {
                  // Sometimes arguments can be streamed as a string or parsed as an object
                  if (typeof tcArgs === "string" && tcArgs.trim()) {
                    try {
                      tcArgs = JSON.parse(tcArgs);
                    } catch (e) {
                      // Keep it as a string if parsing fails, we'll try to parse it later
                    }
                  }

                  accumulatedToolCalls.push({
                    function: {
                      name: tcName,
                      arguments: tcArgs || {}
                    }
                  });
                }
              }
              
              if (options.onToolCallsDetected) {
                options.onToolCallsDetected(accumulatedToolCalls);
              }
            }
          }
        } catch (e) {
          console.warn("Failed to parse stream line:", line, e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: accumulatedContent,
    tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined
  };
}

export interface SpringBootStreamOptions {
  backendUrl: string;
  provider: string;
  model: string;
  messages: OllamaMessage[];
  systemPrompt?: string;
  onChunk: (text: string) => void;
  abortSignal?: AbortSignal;
}

export async function streamSpringBootChat(options: SpringBootStreamOptions): Promise<{ content: string }> {
  const backendUrl = options.backendUrl || "/springboot";
  
  const payload = {
    provider: options.provider,
    model: options.model,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    systemPrompt: options.systemPrompt,
    temperature: 0.7
  };

  const response = await fetch(`${backendUrl}/api/chat/stream`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Accept": "text/event-stream"
    },
    body: JSON.stringify(payload),
    signal: options.abortSignal
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Spring Boot chat error (${response.status}): ${errText || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable.");
  }

  const decoder = new TextDecoder();
  let accumulatedContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Handle standard SSE data: prefix
        if (trimmed.startsWith("data:")) {
          const dataContent = trimmed.substring(5).trim();
          if (dataContent) {
            accumulatedContent += dataContent;
            options.onChunk(dataContent);
          }
        } else {
          // Fallback if raw text is sent without data: prefix
          accumulatedContent += trimmed;
          options.onChunk(trimmed);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: accumulatedContent
  };
}

