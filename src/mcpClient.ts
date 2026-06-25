import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface McpConnectionOptions {
  url: string;
  authToken?: string;
  customHeaders?: Record<string, string>;
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: {
      type: "object";
      properties?: Record<string, any>;
      required?: string[];
      [key: string]: any;
    };
  };
}

export function convertMcpToOllamaTool(mcpTool: any): OllamaTool {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description || "",
      parameters: mcpTool.inputSchema || {
        type: "object",
        properties: {},
      },
    },
  };
}

export class McpManager {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  async connect(options: McpConnectionOptions): Promise<any[]> {
    if (this.client) {
      try {
        await this.disconnect();
      } catch (e) {
        console.warn("Error disconnecting previous MCP client:", e);
      }
    }

    // Resolve URL (handle development proxies if applicable)
    let targetUrlString = options.url;
    if (options.url === "/mcp" || options.url.startsWith("/mcp/")) {
      // If same-origin proxy, use absolute URL of the window or relative
      const loc = window.location;
      targetUrlString = `${loc.protocol}//${loc.host}${options.url}`;
    }

    const mcpUrl = new URL(targetUrlString);
    
    const headers: Record<string, string> = { ...options.customHeaders };
    if (options.authToken) {
      const token = options.authToken.trim();
      if (token) {
        headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }
    }

    // Create SSEClientTransport with custom headers if any are supplied
    const transportOptions: any = {};
    if (Object.keys(headers).length > 0) {
      transportOptions.eventSourceInit = { headers };
      transportOptions.requestInit = { headers };
    }

    this.transport = new SSEClientTransport(mcpUrl, transportOptions);
    this.client = new Client(
      {
        name: "TTS-Assistant-Web-Client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);

    // List tools and return
    const toolsResult = await this.client.listTools();
    const tools = toolsResult.tools || [];
    console.log(`[MCP] Connected! Discovered ${tools.length} tools:`, tools.map((t: any) => t.name));
    return tools;
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client is not connected.");
    }
    return await this.client.callTool({
      name,
      arguments: args,
    });
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        console.warn("Failed to close client:", e);
      }
      this.client = null;
      this.transport = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
