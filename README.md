# TTS Assistant — Standalone React & MCP Portal

TTS Assistant is a standalone, client-side React application designed to orchestrate local LLMs (Ollama) and Model Context Protocol (MCP) servers (such as Superset/BiDarshan). All conversation context and tool calling execution is managed entirely inside the web browser.

## Core Features
- **Incremental Streaming Chat**: Streams real-time tokens from local Ollama instances.
- **Claude-like Tool Visualization**: Dynamically detects `tool_calls` from the LLM, executes them securely via MCP, and surfaces collapsible details (pretty-printed JSON inputs and outputs) directly inline within the chat bubble.
- **Dynamic Configuration**: Customize Ollama URLs, MCP SSE endpoints, authorization headers, and system prompts dynamically from the built-in Settings workspace.
- **IndexedDB Client Persistence**: Local conversations are saved securely on the browser, allowing you to re-open, delete, or switch past chats.

---

## Getting Started

### 1. Setup Ollama
To run the LLM locally, download [Ollama](https://ollama.com) and start the daemon. Because this application runs in the browser, allow origins to bypass CORS if connecting directly:

```bash
# Start Ollama allowing cross-origin requests
OLLAMA_ORIGINS="*" ollama serve
```

In another terminal, pull the high-performing tool-calling model:
```bash
ollama pull qwen3:30b
```

### 2. Configure Environment Variables
Copy or create `.env` from `.env.example`:

```env
# URL to local or remote Ollama server
VITE_OLLAMA_URL="http://localhost:11434"

# URL to Superset (BiDarshan) MCP SSE Endpoint
VITE_MCP_URL="https://bidarshan-dev2.dcservices.in/mcp"
```

### 3. Start Development Server
Install dependencies and launch Vite:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to interact with the application.

---

## CORS & Production Reverse Proxy

Because browser applications hit CORS when calling distinct server addresses directly, we bypass CORS using reverse proxies.

### Development (Vite Dev Server)
The Vite dev server is pre-configured in `vite.config.ts` to proxy same-origin calls:
- `/ollama/*` proxies directly to `VITE_OLLAMA_URL`
- `/mcp/*` proxies directly to `VITE_MCP_URL`

This lets the frontend connect effortlessly using relative paths `/ollama` and `/mcp`.

### Production (Nginx Proxy)
For live deployment, host this built static bundle behind Nginx, and append these configuration location blocks inside your `nginx.conf`:

```nginx
server {
    listen 80;
    server_name your-portal-domain.com;

    # Serve built static React assets
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy same-origin Ollama requests
    location /ollama/ {
        proxy_pass http://localhost:11434/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Enable HTTP/1.1 for keep-alive & SSE
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Reverse proxy same-origin Superset MCP requests
    location /mcp/ {
        proxy_pass https://bidarshan-dev2.dcservices.in/mcp/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE Streaming requirements
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
    }
}
```

---

## Technology Stack
- **Framework**: React 19 + TypeScript + Vite 6
- **Styles**: Tailwind CSS v4
- **Icons**: Lucide React
- **MCP Core**: `@modelcontextprotocol/sdk` (utilizing `SSEClientTransport` browser integration)
- **Database**: IndexedDB wrapper (`idb`)
