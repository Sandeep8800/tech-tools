import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON parse middleware for APIs
app.use(express.json());

// Initialize Google Gemini SDK
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  console.log("[Server] Found GEMINI_API_KEY, initializing GoogleGenAI...");
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("[Server] GEMINI_API_KEY not found. Server will run in simulation fallback mode.");
}

// ----------------- SPRING BOOT MOCK ENDPOINTS -----------------

// Health Check Endpoint
const handleHealth = (req: express.Request, res: express.Response) => {
  res.send("TTS Assistant Spring Boot Backend is Online (via Node Full-Stack Engine)!");
};

app.get("/springboot/api/health", handleHealth);
app.get("/api/health", handleHealth);

// Available Models List Endpoint
const handleModels = (req: express.Request, res: express.Response) => {
  const isGeminiActive = !!ai;
  res.json([
    {
      id: "gemini-3.5-flash",
      name: "gemini-3.5-flash",
      details: { parameter_size: "Flash", family: "gemini" },
      provider: "google-ai",
      active: isGeminiActive,
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "gemini-3.1-pro-preview",
      details: { parameter_size: "Pro", family: "gemini" },
      provider: "google-ai",
      active: isGeminiActive,
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "gemini-3.1-flash-lite",
      details: { parameter_size: "Lite", family: "gemini" },
      provider: "google-ai",
      active: isGeminiActive,
    },
    {
      id: "qwen3:30b",
      name: "qwen3:30b",
      details: { parameter_size: "30B", family: "qwen" },
      provider: "ollama",
      active: false,
    },
    {
      id: "llama3:8b",
      name: "llama3:8b",
      details: { parameter_size: "8B", family: "llama" },
      provider: "ollama",
      active: false,
    },
  ]);
};

app.get("/springboot/api/models", handleModels);
app.get("/api/models", handleModels);

// Streaming Chat Endpoint
const handleChatStream = async (req: express.Request, res: express.Response) => {
  const { provider, model, messages, systemPrompt } = req.body;

  console.log(`[Server] Chat request received - Model: ${model}, Messages Count: ${messages?.length}`);

  // Set appropriate headers for chunked streaming response
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Fallback map model names to Gemini models
  let modelToUse = model || "gemini-3.5-flash";
  if (
    modelToUse.includes("qwen") ||
    modelToUse.includes("llama") ||
    modelToUse.includes("deepseek") ||
    modelToUse.includes("mistral")
  ) {
    modelToUse = "gemini-3.5-flash";
  }

  // 1. REAL GEMINI STREAMING ENGINE
  if (ai && messages && messages.length > 0) {
    try {
      // Map message history to Gemini API format, merging consecutive messages of same role
      const contents: any[] = [];
      for (const msg of messages) {
        const role = msg.role === "assistant" ? "model" : "user";
        const last = contents[contents.length - 1];
        if (last && last.role === role) {
          last.parts[0].text += "\n" + (msg.content || "");
        } else {
          contents.push({
            role,
            parts: [{ text: msg.content || "" }],
          });
        }
      }

      console.log(`[Server] Streaming from Gemini using model: ${modelToUse}...`);

      const stream = await ai.models.generateContentStream({
        model: modelToUse,
        contents: contents,
        config: {
          systemInstruction: systemPrompt || undefined,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          res.write(text);
        }
      }

      res.end();
      return;
    } catch (err: any) {
      console.error("[Server] Gemini Streaming Error:", err);
      res.write(`\n\n*(Error during Gemini live streaming: ${err.message || String(err)})*`);
      res.end();
      return;
    }
  }

  // 2. BACKUP MOCK SIMULATOR FALLBACK (If API key is missing or failed)
  console.log("[Server] Using simulated fallback engine response...");
  const userMessage = messages?.[messages.length - 1]?.content || "";
  const lowUser = userMessage.toLowerCase();

  let responseText = "";

  if (lowUser.includes("dashboard") || lowUser.includes("list")) {
    responseText = "Certainly! I am currently running in offline simulation mode, but I can assist you with our mock Superset dashboard tools.\n\nTo view all available dashboards, I am triggering the `list_dashboards` tool. Here is the list of active business intelligence boards:\n\n| Dashboard ID | Title | Owner | Charts Count | Last Updated |\n| :--- | :--- | :--- | :--- | :--- |\n| `sales_performance` | Sales & Revenue Performance | Analytics Team | 8 | 2026-06-20 |\n| `user_engagement` | User Growth & Retention | Product Team | 6 | 2026-06-24 |\n| `subscription_health` | Subscription & Billing Metrics | Finance Team | 5 | 2026-06-22 |";
  } else if (lowUser.includes("schema") || lowUser.includes("table") || lowUser.includes("columns")) {
    responseText = "I can help you explore our database schema in the analytics sandbox.\n\nTo fetch the tables, I will execute the `list_tables` tool. Here are the core data tables available:\n\n1. `subscription_events` - Logs of all billing events, signups, and upgrades.\n2. `user_demographics` - Anonymized customer geography, age, and signup channels.\n3. `daily_revenue_summary` - Pre-aggregated daily financial aggregates.\n\nLet me know if you would like to run a custom SQL query on any of these tables!";
  } else if (lowUser.includes("select") || lowUser.includes("query") || lowUser.includes("sql")) {
    responseText = "Executing your analytical SQL query against our warehouse sandbox using the `run_sql_query` tool:\n\n```sql\n" + (userMessage.includes("```") ? "SELECT * FROM daily_revenue_summary LIMIT 5" : userMessage) + "\n```\n\nHere are the simulated query results:\n\n| date | total_revenue | subscribers_active | conversion_rate |\n| :--- | :--- | :--- | :--- |\n| 2026-06-21 | $42,500 | 12,450 | 3.42% |\n| 2026-06-22 | $44,100 | 12,620 | 3.48% |\n| 2026-06-23 | $43,800 | 12,590 | 3.45% |\n| 2026-06-24 | $46,200 | 12,810 | 3.55% |";
  } else {
    responseText = `Hello! I am your AI Workspace assistant. I can help you orchestrate dashboards, query metrics, explore table schemas, and execute analytical tasks.

Since the remote Spring Boot backend is offline, I am running directly via a local full-stack server integration on port 3000. I can trigger simulated Superset tools for you!

Try asking me:
* **"List all available dashboards"**
* **"Show me the database tables"**
* **"Run a query on daily revenue summary"**`;
  }

  // Stream mock words with short delays to simulate streaming
  const words = responseText.split(" ");
  let wordIdx = 0;

  const interval = setInterval(() => {
    if (wordIdx < words.length) {
      res.write(words[wordIdx] + " ");
      wordIdx++;
    } else {
      clearInterval(interval);
      res.end();
    }
  }, 15);
};

app.post("/springboot/api/chat/stream", handleChatStream);
app.post("/api/chat/stream", handleChatStream);

// ----------------- VITE DEVELOPMENT & PRODUCTION INTEGRATION -----------------

async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode - Mount Vite in middleware mode
    console.log("[Server] Booting in DEVELOPMENT mode with Vite dev middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode - Serve static files from the build output directory
    console.log("[Server] Booting in PRODUCTION mode serving static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Unified full-stack app running on http://localhost:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("[Server] Failed to initialize server:", err);
});
