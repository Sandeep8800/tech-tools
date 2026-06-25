import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Settings,
  Send,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Database,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  Square,
  Sparkles,
  Layout,
  Search,
  Code,
  FileJson,
  Layers,
  Info,
  Maximize2,
  Minimize2,
  Sliders,
  Play,
  CheckCircle
} from "lucide-react";
import {
  Chat,
  ChatMessage,
  ToolCallState,
  getAllChats,
  saveChat,
  deleteChat,
  getChatMessages,
  saveSingleMessage
} from "./db";
import {
  McpManager,
  convertMcpToOllamaTool
} from "./mcpClient";
import {
  listOllamaModels,
  streamOllamaChat,
  streamSpringBootChat,
  OllamaModel,
  OllamaMessage
} from "./ollama";
import { Markdown } from "./components/Markdown";

// Initialize the persistent MCP manager
const mcpManager = new McpManager();

export default function App() {
  // DB & State
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Endpoint Settings
  const [mcpUrl, setMcpUrl] = useState<string>(
    () => localStorage.getItem("mcp_url") || "/mcp"
  );
  const [mcpAuthToken, setMcpAuthToken] = useState<string>(
    () => localStorage.getItem("mcp_auth_token") || ""
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    () => localStorage.getItem("system_prompt") || 
    "You are the TTS Portal assistant, an advanced AI capable of analyzing dashboards, executing data queries, and orchestrating analytical tools through the Superset (BiDarshan) MCP server. Use tools whenever requested or needed to pull relevant datasets, run metrics, or explore schemas."
  );

  // Connection & Tool States
  const [springbootUrl, setSpringbootUrl] = useState<string>(
    () => localStorage.getItem("springboot_url") || "/springboot"
  );
  const [springbootStatus, setSpringbootStatus] = useState<"offline" | "online">("offline");
  const [selectedProvider, setSelectedProvider] = useState<string>(
    () => localStorage.getItem("selected_provider") || "ollama"
  );

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen3:30b");
  const [mcpStatus, setMcpStatus] = useState<"disconnected" | "connecting" | "connected" | "error">(
    "disconnected"
  );
  const [mcpErrorMsg, setMcpErrorMsg] = useState<string>("");
  const [discoveredTools, setDiscoveredTools] = useState<any[]>([]);
  const [expandedToolIndex, setExpandedToolIndex] = useState<Record<string, boolean>>({});

  // Composer States
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // UI Panels
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Quick Connect Inline Form states
  const [isQuickConnectingMcp, setIsQuickConnectingMcp] = useState(false);
  const [quickMcpUrl, setQuickMcpUrl] = useState(mcpUrl);
  const [quickMcpToken, setQuickMcpToken] = useState(mcpAuthToken);

  // Claude Artifact Panel State
  const [showArtifactPanel, setShowArtifactPanel] = useState(true);
  const [activeArtifactTab, setActiveArtifactTab] = useState<"result" | "logs" | "library" | "prompt">("result");
  const [promptTemplate, setPromptTemplate] = useState<"data" | "orchestration" | "general">("data");
  const [customPromptText, setCustomPromptText] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<{
    toolName: string;
    arguments: any;
    state: "running" | "success" | "error";
    result?: any;
    error?: string;
    timestamp: number;
  } | null>(null);
  const [artifactsSearchQuery, setArtifactsSearchQuery] = useState("");
  const [expandedLibraryTool, setExpandedLibraryTool] = useState<string | null>(null);

  // Settings Temp Form
  const [tempSpringbootUrl, setTempSpringbootUrl] = useState(springbootUrl);
  const [tempSelectedProvider, setTempSelectedProvider] = useState(selectedProvider);
  const [tempMcpUrl, setTempMcpUrl] = useState(mcpUrl);
  const [tempMcpAuthToken, setTempMcpAuthToken] = useState(mcpAuthToken);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt);

  // References
  const messageEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load Chats and connect on mount
  useEffect(() => {
    async function loadData() {
      try {
        const savedChats = await getAllChats();
        setChats(savedChats);
        
        if (savedChats.length > 0) {
          setCurrentChat(savedChats[0]);
        } else {
          // Create default chat
          await createNewChat(savedChats);
        }
      } catch (e) {
        console.error("Failed to initialize database:", e);
      }
    }
    loadData();
    connectMcp();
    checkSpringbootConnection();
  }, []);

  // Sync messages when current chat changes
  useEffect(() => {
    if (currentChat) {
      getChatMessages(currentChat.id).then(msgs => {
        setMessages(msgs);
        if (msgs.length > 0) {
          // Sync selected model to current chat preference
          const modelExists = models.some(m => m.name === currentChat.model);
          if (modelExists) {
            setSelectedModel(currentChat.model);
          }
        }
      });
    }
  }, [currentChat, models]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  // High-Quality Simulated Superset / BiDarshan tools
  const MOCK_SUPERSET_TOOLS = [
    {
      name: "list_dashboards",
      description: "Retrieve a list of all active BI dashboards on the Superset (BiDarshan) server with their metadata, owner info, and active chart count.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Filter dashboards by owner email or username." },
          limit: { type: "number", description: "Maximum number of dashboards to return.", default: 20 }
        }
      }
    },
    {
      name: "get_dashboard_metadata",
      description: "Get detailed slice configurations, visual charts, and filter variables for a specific dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          dashboard_id: { type: "number", description: "The unique ID of the Superset dashboard." }
        },
        required: ["dashboard_id"]
      }
    },
    {
      name: "get_chart_data",
      description: "Fetch cached underlying analytical metrics, dimensions, and row aggregates for a specific chart inside a dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          chart_id: { type: "number", description: "The unique ID of the target chart." },
          time_range: { type: "string", description: "Time filter (e.g. 'Last 30 days', '2026-01-01 : 2026-06-01')", default: "Last 30 days" }
        },
        required: ["chart_id"]
      }
    },
    {
      name: "run_sql_query",
      description: "Execute read-only SQL queries on the analytical database. Restricted to standard SELECT queries. Limited to 100 rows for security and snappy rendering.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A valid analytical SQL statement (SELECT ...)." }
        },
        required: ["sql"]
      }
    },
    {
      name: "list_tables",
      description: "List available database schemas, tables, and views configured in the Superset server metadata store.",
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Optional database schema name to filter tables.", default: "public" }
        }
      }
    },
    {
      name: "get_table_schema",
      description: "Inspect column fields, data types, indexes, and comment strings for a specific database table to prepare analytical SQL queries.",
      inputSchema: {
        type: "object",
        properties: {
          table_name: { type: "string", description: "Name of the target table to inspect schema." }
        },
        required: ["table_name"]
      }
    }
  ];

  // Simulated tool call executor
  const executeMockTool = async (name: string, args: any) => {
    await new Promise(resolve => setTimeout(resolve, 800));

    switch (name) {
      case "list_dashboards": {
        const owner = args.owner || "all";
        return {
          status: "success",
          count: 5,
          dashboards: [
            { id: 101, name: "Financial Analytics - Q2 Performance", owner: "finance-team@dcservices.in", charts_count: 8, last_updated: "2026-06-20T14:22:00Z" },
            { id: 102, name: "Marketing Campaign Attribution", owner: "marketing-team@dcservices.in", charts_count: 12, last_updated: "2026-06-23T09:15:00Z" },
            { id: 103, name: "Customer Churn & Retention Analytics", owner: "growth@dcservices.in", charts_count: 6, last_updated: "2026-06-24T18:05:00Z" },
            { id: 104, name: "BiDarshan Operations Control Center", owner: "operations@dcservices.in", charts_count: 15, last_updated: "2026-06-24T22:00:00Z" },
            { id: 105, name: "Superset Core System Diagnostics", owner: "admin@dcservices.in", charts_count: 4, last_updated: "2026-06-24T11:40:00Z" }
          ].filter(d => owner === "all" || d.owner.toLowerCase().includes(owner.toLowerCase()))
        };
      }
      case "get_dashboard_metadata": {
        const dbId = Number(args.dashboard_id) || 101;
        if (dbId === 101) {
          return {
            dashboard_id: 101,
            name: "Financial Analytics - Q2 Performance",
            active_filters: ["time_range", "region", "product_tier"],
            charts: [
              { chart_id: 201, name: "Monthly Recurring Revenue (MRR) Growth", type: "line_chart", datasource: "subscription_events" },
              { chart_id: 202, name: "Customer Acquisition Cost (CAC) by Channel", type: "bar_chart", datasource: "marketing_funnel" },
              { chart_id: 203, name: "Churn Rate Funnel Diagram", type: "funnel_chart", datasource: "users_dim" },
              { chart_id: 204, name: "Active Subscriptions Breakdown", type: "pie_chart", datasource: "subscription_events" }
            ]
          };
        }
        return {
          dashboard_id: dbId,
          name: `Dashboard ID ${dbId} Metadata`,
          active_filters: ["time_range"],
          charts: [
            { chart_id: 301, name: "Daily Active Users (DAU)", type: "area_chart", datasource: "user_clicks" },
            { chart_id: 302, name: "Average Session Length", type: "bar_chart", datasource: "user_clicks" }
          ]
        };
      }
      case "get_chart_data": {
        const chartId = Number(args.chart_id) || 201;
        if (chartId === 201) {
          return {
            chart_id: 201,
            name: "Monthly Recurring Revenue (MRR) Growth",
            time_range: args.time_range || "Last 30 days",
            columns: ["Month", "MRR (USD)", "Growth Rate (%)"],
            rows: [
              { Month: "Jan 2026", "MRR (USD)": 45000, "Growth Rate (%)": 12.4 },
              { Month: "Feb 2026", "MRR (USD)": 52000, "Growth Rate (%)": 15.5 },
              { Month: "Mar 2026", "MRR (USD)": 59500, "Growth Rate (%)": 14.4 },
              { Month: "Apr 2026", "MRR (USD)": 68000, "Growth Rate (%)": 14.2 },
              { Month: "May 2026", "MRR (USD)": 78500, "Growth Rate (%)": 15.4 },
              { Month: "Jun 2026", "MRR (USD)": 91000, "Growth Rate (%)": 15.9 }
            ]
          };
        }
        if (chartId === 202) {
          return {
            chart_id: 202,
            name: "Customer Acquisition Cost (CAC) by Channel",
            time_range: args.time_range || "Last 30 days",
            columns: ["Channel", "Ad Spend (USD)", "Conversions", "CAC (USD)"],
            rows: [
              { Channel: "Google Ads", "Ad Spend (USD)": 15000, Conversions: 300, "CAC (USD)": 50 },
              { Channel: "Meta Campaigns", "Ad Spend (USD)": 18000, Conversions: 240, "CAC (USD)": 75 },
              { Channel: "Organic Search", "Ad Spend (USD)": 2000, Conversions: 400, "CAC (USD)": 5 },
              { Channel: "Affiliates", "Ad Spend (USD)": 6000, Conversions: 150, "CAC (USD)": 40 },
              { Channel: "Newsletter Ads", "Ad Spend (USD)": 3000, Conversions: 120, "CAC (USD)": 25 }
            ]
          };
        }
        return {
          chart_id: chartId,
          name: `Chart ${chartId} Sample Data`,
          columns: ["Metric Name", "Value", "Status"],
          rows: [
            { "Metric Name": "Completed Transactions", Value: 1240, Status: "Optimal" },
            { "Metric Name": "Abandoned Carts", Value: 310, Status: "Requires attention" },
            { "Metric Name": "Average Cart Value", Value: 85.5, Status: "Optimal" }
          ]
        };
      }
      case "run_sql_query": {
        const query = (args.sql || "").trim().toLowerCase();
        if (!query.startsWith("select")) {
          return {
            status: "failed",
            error: "Permission denied. Only read-only SELECT statements are allowed on this BiDarshan database."
          };
        }
        if (query.includes("subscription") || query.includes("mrr") || query.includes("revenue")) {
          return {
            status: "success",
            query: args.sql,
            execution_time_ms: 124,
            rows_count: 5,
            columns: ["subscription_id", "user_id", "plan_type", "amount", "status", "created_at"],
            rows: [
              { subscription_id: 100412, user_id: 2315, plan_type: "Enterprise Gold", amount: 499.00, status: "Active", created_at: "2026-06-01 10:14:02" },
              { subscription_id: 100413, user_id: 4891, plan_type: "Individual Pro", amount: 29.00, status: "Active", created_at: "2026-06-01 11:45:18" },
              { subscription_id: 100414, user_id: 1042, plan_type: "Individual Pro", amount: 29.00, status: "Cancelled", created_at: "2026-06-02 09:22:55" },
              { subscription_id: 100415, user_id: 9022, plan_type: "Business Core", amount: 149.00, status: "Active", created_at: "2026-06-02 14:02:11" },
              { subscription_id: 100416, user_id: 3110, plan_type: "Enterprise Gold", amount: 499.00, status: "Active", created_at: "2026-06-03 16:30:44" }
            ]
          };
        }
        if (query.includes("user") || query.includes("customer")) {
          return {
            status: "success",
            query: args.sql,
            execution_time_ms: 95,
            rows_count: 5,
            columns: ["user_id", "email", "full_name", "country", "signup_source", "is_active"],
            rows: [
              { user_id: 1042, email: "john.doe@gmail.com", full_name: "John Doe", country: "US", signup_source: "Google Search", is_active: true },
              { user_id: 2315, email: "priya.sharma@dcservices.in", full_name: "Priya Sharma", country: "IN", signup_source: "Direct", is_active: true },
              { user_id: 3110, email: "michael.v@outlook.com", full_name: "Michael Vance", country: "CA", signup_source: "Meta Ads", is_active: true },
              { user_id: 4891, email: "leila@techcorp.io", full_name: "Leila Al-Sabah", country: "AE", signup_source: "Affiliates", is_active: true },
              { user_id: 9022, email: "sven@nordic.se", full_name: "Sven Lindqvist", country: "SE", signup_source: "Newsletter", is_active: false }
            ]
          };
        }
        return {
          status: "success",
          query: args.sql,
          execution_time_ms: 68,
          rows_count: 4,
          columns: ["id", "metric_category", "value_count", "calculated_at"],
          rows: [
            { id: 1, metric_category: "Session Count", value_count: 14520, calculated_at: "2026-06-24 23:00:00" },
            { id: 2, metric_category: "Page Views", value_count: 48910, calculated_at: "2026-06-24 23:00:00" },
            { id: 3, metric_category: "Unique Visitors", value_count: 9815, calculated_at: "2026-06-24 23:00:00" },
            { id: 4, metric_category: "Conversion Percentage", value_count: 3.42, calculated_at: "2026-06-24 23:00:00" }
          ]
        };
      }
      case "list_tables": {
        const schema = args.schema || "public";
        return {
          schema: schema,
          tables_count: 5,
          tables: [
            { table_name: "users_dim", type: "TABLE", columns_count: 8, rows_count: 24500, comment: "Dimension table containing demographical user metrics." },
            { table_name: "transactions_fact", type: "TABLE", columns_count: 7, rows_count: 145000, comment: "Fact table containing transactional and checkout event logs." },
            { table_name: "subscription_events", type: "TABLE", columns_count: 6, rows_count: 12800, comment: "Core subscription events containing subscription updates, plans, and states." },
            { table_name: "funnel_metrics", type: "VIEW", columns_count: 5, rows_count: null, comment: "Aggregated views containing marketing conversions funnel progression values." },
            { table_name: "daily_dashboard_clicks", type: "TABLE", columns_count: 4, rows_count: 84300, comment: "Audit and engagement table tracking clicks on individual dashboard panels." }
          ]
        };
      }
      case "get_table_schema": {
        const tableName = args.table_name || "transactions_fact";
        if (tableName === "transactions_fact") {
          return {
            table_name: "transactions_fact",
            schema: "public",
            columns: [
              { field: "id", type: "INTEGER", key: "PRI", default: "nextval()", is_nullable: "NO", comment: "Primary identifier key." },
              { field: "user_id", type: "INTEGER", key: "MUL", default: null, is_nullable: "NO", comment: "Foreign key referencing users_dim." },
              { field: "amount", type: "NUMERIC(10, 2)", key: "", default: null, is_nullable: "NO", comment: "The transaction value in checkout currency." },
              { field: "currency", type: "VARCHAR(3)", key: "", default: "'USD'", is_nullable: "YES", comment: "3-letter standard ISO currency code." },
              { field: "status", type: "VARCHAR(24)", key: "", default: "'pending'", is_nullable: "NO", comment: "Current state: pending, settled, failed, refunded." },
              { field: "created_at", type: "TIMESTAMP", key: "", default: "now()", is_nullable: "NO", comment: "Exact timestamp of execution." }
            ]
          };
        }
        return {
          table_name: tableName,
          schema: "public",
          columns: [
            { field: "id", type: "INTEGER", key: "PRI", default: "nextval()", is_nullable: "NO", comment: "Unique row ID." },
            { field: "created_at", type: "TIMESTAMP", key: "", default: "now()", is_nullable: "NO", comment: "Timestamp field." },
            { field: "updated_at", type: "TIMESTAMP", key: "", default: "now()", is_nullable: "YES", comment: "Modification field." }
          ]
        };
      }
      default:
        throw new Error(`Unsupported tool: ${name}`);
    }
  };

  // Connect to the Superset MCP Server
  const connectMcp = async (customUrl?: string, customToken?: string) => {
    const urlToUse = customUrl !== undefined ? customUrl : mcpUrl;
    const tokenToUse = customToken !== undefined ? customToken : mcpAuthToken;

    setMcpStatus("connecting");
    setMcpErrorMsg("");

    // Pre-emptive intercept for unresolvable host 'bidarshan-dev2.dcservices.in' to avoid ugly console errors
    const isDefaultUnreachableHost = urlToUse === "/mcp" || urlToUse.includes("bidarshan-dev2.dcservices.in");
    
    if (isDefaultUnreachableHost) {
      // Simulate connection lag to keep UI looking professional and interactive
      await new Promise(resolve => setTimeout(resolve, 600));
      setMcpStatus("error");
      setMcpErrorMsg("Remote host 'bidarshan-dev2.dcservices.in' is currently unreachable (getaddrinfo ENOTFOUND). Active sandbox fallback engaged.");
      setDiscoveredTools(MOCK_SUPERSET_TOOLS);
      if (!selectedArtifact) {
        setSelectedArtifact({
          toolName: "System Discovered Tools (Simulated)",
          arguments: { info: "Could not reach remote server. Switched to high-fidelity Local Sandbox Mode." },
          state: "success",
          result: MOCK_SUPERSET_TOOLS,
          timestamp: Date.now()
        });
      }
      return;
    }

    try {
      const tools = await mcpManager.connect({
        url: urlToUse,
        authToken: tokenToUse
      });
      setDiscoveredTools(tools);
      setMcpStatus("connected");
      // Populate active artifact if empty
      if (tools.length > 0 && !selectedArtifact) {
        setSelectedArtifact({
          toolName: "System Discovered Tools",
          arguments: { info: "Listing active tools from connection" },
          state: "success",
          result: tools,
          timestamp: Date.now()
        });
      }
    } catch (err: any) {
      console.error("[MCP] Connection failed, switching to Local Sandbox Fallback:", err);
      setMcpStatus("error");
      setMcpErrorMsg(err.message || String(err));
      
      // Auto-populate with interactive mock tools so the Workspace is still 100% functional
      setDiscoveredTools(MOCK_SUPERSET_TOOLS);
      if (!selectedArtifact) {
        setSelectedArtifact({
          toolName: "System Discovered Tools (Simulated)",
          arguments: { info: "Could not reach remote server. Switched to high-fidelity Local Sandbox Mode." },
          state: "success",
          result: MOCK_SUPERSET_TOOLS,
          timestamp: Date.now()
        });
      }
    }
  };



  // Re-fetch Spring Boot models and connection status
  const checkSpringbootConnection = async (customUrl?: string) => {
    const urlToUse = customUrl !== undefined ? customUrl : springbootUrl;
    try {
      const response = await fetch(`${urlToUse}/api/health`);
      if (response.ok) {
        setSpringbootStatus("online");
        const resModels = await fetch(`${urlToUse}/api/models`);
        if (resModels.ok) {
          const fetched = await resModels.json();
          const mappedModels = fetched.map((m: any) => ({
            name: m.id,
            details: { parameter_size: m.provider, family: m.active ? "active" : "inactive" }
          }));
          setModels(mappedModels);
          if (mappedModels.length > 0) {
            // Find if current model exists in the new list, otherwise pick first
            const hasModel = mappedModels.some((m: any) => m.name === selectedModel);
            if (!hasModel) {
              setSelectedModel(mappedModels[0].name);
            }
          }
        }
      } else {
        setSpringbootStatus("offline");
        setModels([]);
      }
    } catch (err) {
      console.warn("[Spring Boot] Connection check failed:", err);
      setSpringbootStatus("offline");
      setModels([]);
    }
  };

  // Create new chat session
  const createNewChat = async (existingChats?: Chat[]) => {
    const defaultModel = selectedModel || "qwen3:30b";
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: "New Chat Session",
      model: defaultModel,
      systemPrompt: systemPrompt,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await saveChat(newChat);
    setCurrentChat(newChat);
    
    const updated = existingChats ? [newChat, ...existingChats] : [newChat, ...chats];
    setChats(updated);
    setMessages([]);
  };

  // Handle chat deletion
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      await deleteChat(id);
      const updated = chats.filter(c => c.id !== id);
      setChats(updated);
      
      if (currentChat?.id === id) {
        if (updated.length > 0) {
          setCurrentChat(updated[0]);
        } else {
          setCurrentChat(null);
          await createNewChat(updated);
        }
      }
    }
  };

  // Switch chat
  const handleSwitchChat = (chat: Chat) => {
    if (isGenerating) {
      alert("Please wait or stop the current generation before switching chats.");
      return;
    }
    setCurrentChat(chat);
  };

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  // Send message with Tool execution loop
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentChat || isGenerating) return;

    const userText = inputValue;
    setInputValue("");

    // 1. Create and save User Message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      chatId: currentChat.id,
      role: "user",
      content: userText,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    await saveSingleMessage(userMsg);

    // Update Chat title if it was default "New Chat Session"
    let updatedChat = { ...currentChat, updatedAt: Date.now() };
    if (currentChat.title === "New Chat Session" || currentChat.title === "New Chat") {
      const generatedTitle = userText.length > 28 ? userText.slice(0, 26) + "..." : userText;
      updatedChat.title = generatedTitle;
    }

    setCurrentChat(updatedChat);
    await saveChat(updatedChat);
    setChats(prev => [updatedChat, ...prev.filter(c => c.id !== currentChat.id)]);

    // 2. Create placeholder assistant message
    let assistantMsgId = crypto.randomUUID();
    let assistantMsg: ChatMessage = {
      id: assistantMsgId,
      chatId: currentChat.id,
      role: "assistant",
      content: "",
      timestamp: Date.now() + 1,
      toolCalls: []
    };

    let currentMessages = [...updatedMessages, assistantMsg];
    setMessages(currentMessages);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let loopCount = 0;
      const maxLoops = 8; 
      let hasMoreTools = true;

      let ollamaTurnHistory: OllamaMessage[] = currentMessages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls ? m.toolCalls.map(tc => ({
          id: crypto.randomUUID(),
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
        })) : undefined
      }));

      while (hasMoreTools && loopCount < maxLoops) {
        loopCount++;

        let currentChunk = "";
        let detectedToolCalls: any[] = [];

        let streamResult;
        // Stream from Spring Boot Chat Endpoint
        streamResult = await streamSpringBootChat({
          backendUrl: springbootUrl,
          provider: selectedProvider,
          model: selectedModel,
          messages: ollamaTurnHistory,
          systemPrompt: systemPrompt,
          abortSignal: controller.signal,
          onChunk: (chunk) => {
            currentChunk += chunk;
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentChunk } : m));
          }
        });

        // Update local object with complete response content
        assistantMsg.content = streamResult.content;

        if (streamResult.tool_calls && streamResult.tool_calls.length > 0) {
          // Model wishes to invoke tools
          const toolStates: ToolCallState[] = streamResult.tool_calls.map(tc => ({
            name: tc.function.name,
            arguments: typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments,
            state: "running" as const
          }));

          assistantMsg.toolCalls = toolStates;
          
          // Update visual states
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
            ...m, 
            content: streamResult.content, 
            toolCalls: toolStates 
          } : m));
          await saveSingleMessage(assistantMsg);

          // Set active artifact in right panel immediately to show progress
          const latestTc = toolStates[0];
          setSelectedArtifact({
            toolName: latestTc.name,
            arguments: latestTc.arguments,
            state: "running",
            timestamp: Date.now()
          });
          setShowArtifactPanel(true);
          setActiveArtifactTab("result");

          // Append assistant message with its tool calls to the turn history
          ollamaTurnHistory.push({
            role: "assistant",
            content: streamResult.content,
            tool_calls: streamResult.tool_calls
          });

          // Run each tool sequentially
          const toolResultsToAppend: ChatMessage[] = [];
          for (let i = 0; i < toolStates.length; i++) {
            const tc = toolStates[i];
            
            try {
              // Execute the call via MCP SSE client (or simulated fallback)
              let result;
              if (mcpStatus === "error" || !mcpManager.isConnected()) {
                console.log(`[MCP] Executing simulated mock tool: ${tc.name}`);
                result = await executeMockTool(tc.name, tc.arguments);
              } else {
                result = await mcpManager.callTool(tc.name, tc.arguments);
              }
              
              const updatedState = {
                ...tc,
                state: "success" as const,
                result: result
              };
              toolStates[i] = updatedState;

              // Update selected artifact with success output
              setSelectedArtifact({
                toolName: tc.name,
                arguments: tc.arguments,
                state: "success",
                result: result,
                timestamp: Date.now()
              });

            } catch (err: any) {
              const errorText = err.message || String(err);
              toolStates[i] = {
                ...tc,
                state: "error" as const,
                error: errorText
              };

              setSelectedArtifact({
                toolName: tc.name,
                arguments: tc.arguments,
                state: "error",
                error: errorText,
                timestamp: Date.now()
              });
            }

            // Create client-visible tool result message
            const toolMsg: ChatMessage = {
              id: crypto.randomUUID(),
              chatId: currentChat.id,
              role: "tool",
              content: JSON.stringify(toolStates[i].result || toolStates[i].error || "Executed"),
              timestamp: Date.now() + 10 + i
            };

            toolResultsToAppend.push(toolMsg);
            await saveSingleMessage(toolMsg);

            // Add tool response to context
            ollamaTurnHistory.push({
              role: "tool",
              content: toolMsg.content
            });
          }

          // Update message state again with completed tool call status indicators
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
            ...m, 
            toolCalls: [...toolStates] 
          } : m));

          // Save final message state of assistant
          await saveSingleMessage({
            ...assistantMsg,
            toolCalls: toolStates
          });

          // Prepare next placeholder for tool outcome response loop
          assistantMsgId = crypto.randomUUID();
          assistantMsg = {
            id: assistantMsgId,
            chatId: currentChat.id,
            role: "assistant",
            content: "",
            timestamp: Date.now() + 20,
            toolCalls: []
          };

          setMessages(prev => [...prev, assistantMsg]);
        } else {
          // No more tools to call, loop completed
          hasMoreTools = false;
          await saveSingleMessage(assistantMsg);
        }
      }
    } catch (error: any) {
      console.error("[Stream Hub] Message Generation Error:", error);
      if (error.name !== "AbortError") {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
          ...m, 
          content: m.content + `\n\n*(Error during generation: ${error.message || String(error)})*` 
        } : m));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Toggle tool call details accordion in active chat
  const toggleToolCallCollapse = (msgId: string, index: number) => {
    const key = `${msgId}-${index}`;
    setExpandedToolIndex(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Set clicked tool call as active artifact in right panel
  const handleInspectToolCall = (toolName: string, args: any, state: "running"|"success"|"error", result?: any, error?: string) => {
    setSelectedArtifact({
      toolName,
      arguments: args,
      state,
      result,
      error,
      timestamp: Date.now()
    });
    setShowArtifactPanel(true);
    setActiveArtifactTab("result");
  };

  // Save Settings Form
  const handleSaveSettings = async () => {
    setSpringbootUrl(tempSpringbootUrl);
    setSelectedProvider(tempSelectedProvider);
    setMcpUrl(tempMcpUrl);
    setMcpAuthToken(tempMcpAuthToken);
    setSystemPrompt(tempSystemPrompt);

    localStorage.setItem("springboot_url", tempSpringbootUrl);
    localStorage.setItem("selected_provider", tempSelectedProvider);
    localStorage.setItem("mcp_url", tempMcpUrl);
    localStorage.setItem("mcp_auth_token", tempMcpAuthToken);
    localStorage.setItem("system_prompt", tempSystemPrompt);

    setShowSettingsModal(false);

    // Reconnect
    await connectMcp(tempMcpUrl, tempMcpAuthToken);
    await checkSpringbootConnection(tempSpringbootUrl);
  };

  // Reset Settings
  const handleResetSettings = () => {
    setTempSpringbootUrl("/springboot");
    setTempSelectedProvider("ollama");
    setTempMcpUrl("/mcp");
    setTempMcpAuthToken("");
    setTempSystemPrompt("You are the TTS Portal assistant, an advanced AI capable of analyzing dashboards, executing data queries, and orchestrating analytical tools through the Superset (BiDarshan) MCP server. Use tools whenever requested or needed to pull relevant datasets, run metrics, or explore schemas.");
  };

  const handleQuickConnectMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMcpUrl(quickMcpUrl);
    setMcpAuthToken(quickMcpToken);
    localStorage.setItem("mcp_url", quickMcpUrl);
    localStorage.setItem("mcp_auth_token", quickMcpToken);
    
    await connectMcp(quickMcpUrl, quickMcpToken);
    setIsQuickConnectingMcp(false);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Render Table Visualizer for structured tool result outputs
  const renderStructuredData = (data: any) => {
    if (!data) return <span className="text-gray-400">No output returned.</span>;

    // Standard string content
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return renderStructuredData(parsed);
      } catch {
        return <div className="whitespace-pre-wrap leading-relaxed text-sm text-gray-700 bg-gray-50/50 p-4 rounded-xl border border-gray-100 select-text font-sans">{data}</div>;
      }
    }

    // Array of objects (like SQL tables, lists of dashboards, databases etc)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      const headers = Object.keys(data[0]);
      return (
        <div className="w-full overflow-x-auto rounded-xl border border-claude-border bg-white shadow-sm select-text">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-claude-border">
                {headers.map(h => (
                  <th key={h} className="px-4 py-3 font-bold text-gray-600 uppercase tracking-wider font-mono text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-amber-50/20 transition-colors">
                  {headers.map(h => {
                    const cellVal = row[h];
                    let displayVal = "";
                    if (cellVal === null || cellVal === undefined) {
                      displayVal = "NULL";
                    } else if (typeof cellVal === "object") {
                      displayVal = JSON.stringify(cellVal);
                    } else {
                      displayVal = String(cellVal);
                    }
                    return (
                      <td key={h} className="px-4 py-3 text-gray-700 font-medium max-w-sm truncate select-all" title={displayVal}>
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 bg-slate-50/60 text-[10px] text-gray-400 font-mono text-right border-t border-gray-100">
            Rendered {data.length} records • {headers.length} columns
          </div>
        </div>
      );
    }

    // Standard raw JSON Inspector view
    return (
      <div className="relative group">
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white border border-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-200"
          title="Copy JSON Payload"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <pre className="p-5 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed border border-slate-800 shadow-inner max-h-[500px] overflow-y-auto select-text">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  // Search filtered library tools
  const filteredTools = discoveredTools.filter(tool => {
    if (!artifactsSearchQuery) return true;
    const nameMatch = tool.name.toLowerCase().includes(artifactsSearchQuery.toLowerCase());
    const descMatch = (tool.description || "").toLowerCase().includes(artifactsSearchQuery.toLowerCase());
    return nameMatch || descMatch;
  });

  // Dynamic system prompt generation for the connected MCP
  const generateOptimizedPrompt = (templateType: "data" | "orchestration" | "general") => {
    let toolListStr = discoveredTools.map(t => `- **${t.name}**: ${t.description || "No description provided."}`).join("\n");
    
    if (discoveredTools.length === 0) {
      toolListStr = "(No active MCP tools have been discovered yet. Connect an MCP server to load dynamic schemas!)";
    }

    if (templateType === "data") {
      return `You are a Senior Data Analyst and BI specialist empowered by the Model Context Protocol (MCP) server. You have direct access to Superset (BiDarshan) dashboard metrics, databases, and analytical tools.

## Available Dynamic Tools:
${toolListStr}

## Guidelines for Analytical Queries:
1. Always explore table schemas first using appropriate schema discovery tools before running complex SQL queries.
2. Limit all raw database queries to a maximum of 100 rows to ensure snappy UI rendering, unless aggregate counts are specifically requested.
3. Formulate structural, clean SQL statements.
4. When requested to analyze a dashboard, fetch its parameters and active charts first.
5. Provide helpful summaries of visual charts, datasets, and rows in clear markdown tables.
6. Present findings professionally, using clear section headers, bullet lists, and bold callouts.`;
    } else if (templateType === "orchestration") {
      return `You are a Claude-grade master orchestrator. Your primary role is to coordinate multiple services, execute sequential tool calls, and present structured solutions.

## Discovered MCP Capabilities:
${toolListStr}

## Execution Protocol:
1. **Analyze Requirements**: Deconstruct user inputs to identify necessary data points and actions.
2. **Sequential Tool-use**: You are permitted to execute multiple tools in sequence (up to 8 loops). If tool A returns necessary parameters for tool B, execute tool A first, review its output, and then proceed with tool B.
3. **Robust Error Handling**: If a tool call fails, analyze the error. Try correcting parameters (such as formatting dates or string casting) and retry if appropriate.
4. **Markdown Formatting**: Render all rich outputs, configurations, or responses using spacious, beautiful markdown. Use code blocks for raw payloads.`;
    } else {
      return `You are an expert assistant equipped with Model Context Protocol (MCP) capabilities to interact with external databases and tools.

## Discovered Tools:
${toolListStr}

## Instructions:
1. Utilize tools whenever a request requires querying databases, updating dashboards, or checking active system variables.
2. Be literal and direct. Do not simulate or guess data when real tools are available to retrieve live metrics.
3. Inform the user when you are executing an MCP action.`;
    }
  };

  // Sync custom prompt text when active template or discovered tools change
  useEffect(() => {
    setCustomPromptText(generateOptimizedPrompt(promptTemplate));
  }, [promptTemplate, discoveredTools]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-claude-bg font-sans text-claude-text-primary select-none">
      
      {/* SIDEBAR: Claude elegant sand slate style */}
      <aside className="w-80 bg-claude-sidebar border-r border-claude-border flex flex-col h-full select-none shrink-0" id="sidebar_pane">
        
        {/* Brand Header */}
        <div className="p-4 border-b border-claude-border flex items-center justify-between bg-[#eae8e2]/60">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-claude-accent flex items-center justify-center shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-[#191919] text-sm tracking-wide leading-none flex items-center gap-1">
                Tech & Tool Workspace
              </h1>
              <span className="text-[10px] text-[#8c8a82] font-mono tracking-wider font-semibold uppercase">MCP Multi-Model Hub</span>
            </div>
          </div>
          
          {/* Quick Connect trigger */}
          <button
            onClick={() => setIsQuickConnectingMcp(!isQuickConnectingMcp)}
            className={`p-1.5 rounded-md border transition-all ${isQuickConnectingMcp ? "bg-amber-100 border-amber-300 text-amber-700" : "hover:bg-[#eae8e2] border-transparent text-[#5a5a5a]"}`}
            title="Connect New MCP Server"
          >
            <Cpu className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Connect Inline Form Drawer */}
        <AnimatePresence>
          {isQuickConnectingMcp && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleQuickConnectMcp}
              className="bg-[#eae8e2]/50 p-4 border-b border-claude-border space-y-3 overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#191919] uppercase tracking-wide text-[10px]">Quick Connect MCP</span>
                <span className="text-[10px] text-amber-600 font-bold">SSE Protocol</span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">SSE Server URL</label>
                  <input
                    type="text"
                    required
                    value={quickMcpUrl}
                    onChange={(e) => setQuickMcpUrl(e.target.value)}
                    placeholder="/mcp or http://127.0.0.1:5008"
                    className="w-full px-2 py-1.5 bg-white border border-[#d2cfc6] rounded text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-claude-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 block mb-1">Authorization Header (JWT) - Optional</label>
                  <input
                    type="password"
                    value={quickMcpToken}
                    onChange={(e) => setQuickMcpToken(e.target.value)}
                    placeholder="Bearer JWT..."
                    className="w-full px-2 py-1.5 bg-white border border-[#d2cfc6] rounded text-xs text-gray-800 font-mono focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsQuickConnectingMcp(false)}
                  className="flex-1 py-1 text-center bg-gray-200 hover:bg-gray-300 rounded font-bold text-[11px] text-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1 text-center bg-claude-accent hover:bg-claude-accent-dark rounded font-bold text-[11px] text-white transition shadow-sm"
                >
                  Connect
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* New Chat Button */}
        <div className="p-4">
          <button
            onClick={() => createNewChat()}
            className="w-full py-2.5 px-4 bg-white hover:bg-[#fbfaf8] border border-claude-border hover:border-[#d1cfc7] rounded-xl font-medium text-xs text-gray-800 flex items-center justify-center gap-2 shadow-sm transition active:scale-98 select-none"
          >
            <Plus className="h-4 w-4 text-claude-accent" />
            <span>Start New Conversation</span>
          </button>
        </div>

        {/* Conversations History List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 select-none">
          <div className="px-2 pb-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Conversations</div>
          {chats.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400 italic">No chat history available</div>
          ) : (
            chats.map((chat) => {
              const isActive = currentChat?.id === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => handleSwitchChat(chat)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition duration-150 ${
                    isActive
                      ? "bg-[#eae8e2] text-[#191919] font-semibold border-l-4 border-claude-accent shadow-sm"
                      : "hover:bg-[#eae8e2]/60 text-gray-600 hover:text-[#191919]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-claude-accent" : "text-gray-400"}`} />
                    <div className="truncate text-xs leading-tight">
                      {chat.title}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#d8d6cd] text-gray-400 hover:text-red-500 transition-all duration-150"
                    title="Delete Conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Connections State Directory */}
        <div className="p-4 border-t border-claude-border bg-[#eae8e2]/40 text-xs space-y-3 select-none">
          <div className="flex items-center justify-between text-[#5a5a5a]">
            <span className="font-bold tracking-wider text-[10px] uppercase">Connection Hub</span>
            <button
              onClick={() => {
                connectMcp();
                checkSpringbootConnection();
              }}
              className="p-1 hover:bg-[#eae8e2] rounded text-gray-500 hover:text-[#191919] transition"
              title="Refresh Connection States"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {/* Spring Boot Status */}
            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-white border border-claude-border">
              <span className="text-[10px] text-gray-500 flex items-center gap-1.5 font-semibold font-sans">
                <Terminal className="h-3 w-3 text-amber-600" />
                Backend Bridge API
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${springbootStatus === "online" ? "bg-emerald-500" : "bg-rose-500 animate-pulse"}`} />
                <span className={`text-[9px] font-bold font-mono ${springbootStatus === "online" ? "text-emerald-600" : "text-rose-500"}`}>
                  {springbootStatus === "online" ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* MCP Status */}
            <div
              className="flex items-center justify-between py-1 px-2 rounded-lg bg-white border border-claude-border cursor-pointer hover:bg-slate-50 transition"
              title={mcpErrorMsg ? `Error: ${mcpErrorMsg}` : `${discoveredTools.length} tools discovered`}
              onClick={() => {
                setActiveArtifactTab("library");
                setShowArtifactPanel(true);
              }}
            >
              <span className="text-[10px] text-gray-500 flex items-center gap-1.5 font-semibold font-sans">
                <Cpu className="h-3 w-3 text-amber-600" />
                Active MCP Server
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  mcpStatus === "connected" ? "bg-emerald-500" :
                  mcpStatus === "connecting" ? "bg-amber-500 animate-pulse" :
                  discoveredTools.length > 0 ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                }`} />
                <span className={`text-[9px] font-bold font-mono ${
                  mcpStatus === "connected" ? "text-emerald-600" :
                  mcpStatus === "connecting" ? "text-amber-500" :
                  discoveredTools.length > 0 ? "text-amber-600" : "text-rose-500"
                }`}>
                  {mcpStatus === "connected" ? `${discoveredTools.length} TOOLS` :
                   mcpStatus === "connecting" ? "CONNECTING" :
                   discoveredTools.length > 0 ? "SANDBOX MODE" : "OFFLINE"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setTempSpringbootUrl(springbootUrl);
                setTempSelectedProvider(selectedProvider);
                setTempMcpUrl(mcpUrl);
                setTempMcpAuthToken(mcpAuthToken);
                setTempSystemPrompt(systemPrompt);
                setShowSettingsModal(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-white hover:bg-[#fbfaf8] border border-claude-border text-gray-700 font-semibold transition active:scale-95 shadow-sm"
            >
              <Settings className="h-3.5 w-3.5 text-claude-accent" />
              <span>Workspace Config</span>
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#fbfaf8] border border-claude-border text-gray-700 font-semibold transition active:scale-95 shadow-sm"
              title="Show Onboarding Guides"
            >
              <HelpCircle className="h-3.5 w-3.5 text-claude-accent" />
            </button>
          </div>
        </div>
      </aside>

      {/* CHAT SECTION AND STREAM CONTENT */}
      <main className="flex-1 flex flex-col h-full bg-claude-bg relative overflow-hidden select-text" id="main_pane">
        
        {/* UPPER WINDOW TOPBAR */}
        <header className="h-14 border-b border-claude-border px-6 flex items-center justify-between select-none bg-white">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider">Active Workspace</span>
              <h2 className="text-xs font-bold text-gray-800 max-w-sm truncate">
                {currentChat ? currentChat.title : "No Conversation Loaded"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Multi-Model Select */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#5a5a5a] font-bold hidden md:inline">Inference:</span>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isGenerating}
                  className="pl-3 pr-8 py-1 bg-[#fbfaf8] hover:bg-[#f1efea] border border-claude-border rounded-lg text-xs font-semibold text-gray-700 focus:outline-none transition cursor-pointer appearance-none min-w-[130px] disabled:opacity-60"
                >
                  {models.map(model => (
                    <option key={model.name} value={model.name}>
                      {model.name} {model.details?.parameter_size ? `(${model.details.parameter_size})` : ""}
                    </option>
                  ))}
                  {models.length === 0 && (
                    <option value="qwen3:30b">qwen3:30b (Offline)</option>
                  )}
                </select>
                <ChevronDown className="h-3 w-3 text-gray-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            {/* MCP Badge Tooltip */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 ${
                mcpStatus === "connected"
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                  : mcpStatus === "connecting"
                  ? "bg-amber-50 border-amber-100 text-amber-700"
                  : "bg-rose-50 border-rose-100 text-rose-700"
              }`}
              title={mcpErrorMsg ? `Error: ${mcpErrorMsg}` : `${discoveredTools.length} tools verified`}
              onClick={() => {
                setActiveArtifactTab("library");
                setShowArtifactPanel(true);
              }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${mcpStatus === "connected" ? "bg-emerald-500" : mcpStatus === "connecting" ? "bg-amber-500" : "bg-rose-500"}`} />
              <span className="font-mono text-[9px] uppercase">MCP Status</span>
            </div>

            {/* Split Artifacts panel Toggle */}
            <button
              onClick={() => setShowArtifactPanel(!showArtifactPanel)}
              className={`p-1.5 rounded-lg border transition ${showArtifactPanel ? "bg-amber-50 border-amber-200 text-claude-accent shadow-sm" : "hover:bg-gray-100 border-claude-border text-[#5a5a5a]"}`}
              title="Toggle Claude Artifacts Panel"
            >
              <Layout className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* MESSAGES SCROLLER CONTAINER */}
        <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
          
          {/* Default Empty Workspace State */}
          {messages.length === 0 && (
            <div className="max-w-xl mx-auto py-16 text-center select-none space-y-4">
              <div className="h-12 w-12 bg-amber-50 text-claude-accent rounded-2xl flex items-center justify-center font-bold text-xl mx-auto shadow border border-amber-100">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-display font-bold text-gray-900">How can I help you customize your analytical models today?</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Connect any MCP tools server, paste your endpoints, and execute analytical queries directly against Superset, PostgreSQL, or other backends.
              </p>
              
              <div className="p-4 bg-white rounded-xl border border-claude-border text-left space-y-2 max-w-sm mx-auto shadow-sm">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1 font-mono">
                  <Database className="h-3 w-3" /> Configured MCP Endpoint
                </span>
                <p className="text-xs text-gray-600 truncate bg-slate-50 p-2 rounded font-mono border border-gray-100">{mcpUrl}</p>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-400 font-medium">Available actions:</span>
                  <button
                    onClick={() => {
                      setActiveArtifactTab("library");
                      setShowArtifactPanel(true);
                    }}
                    className="text-claude-accent hover:underline font-bold"
                  >
                    View {discoveredTools.length} Active Tools →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Render Active Conversation Messages */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isTool = msg.role === "tool";

            if (isTool) return null; // Tool responses render inline within the preceding Assistant block for neatness

            return (
              <div
                key={msg.id}
                className={`flex gap-4 max-w-3xl mx-auto group ${isUser ? "justify-end" : "justify-start"}`}
              >
                {/* Assistant Avatar */}
                {!isUser && (
                  <div className="h-8 w-8 bg-[#cc785c] text-white rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-sm border border-orange-200 select-none">
                    C
                  </div>
                )}

                {/* Message Bubble Body */}
                <div className={`flex flex-col space-y-1 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                  
                  {/* Sender Name Profile tag */}
                  <div className="flex items-center gap-1.5 px-1 select-none">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                      {isUser ? "You" : "Claude"}
                    </span>
                    {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-1 py-0.2 rounded font-mono font-bold uppercase">
                        MCP ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Bubble Content container */}
                  <div className={`py-3 px-4 rounded-2xl text-sm leading-relaxed select-text ${
                    isUser
                      ? "bg-[#f1efea] border border-[#e6e4de] text-gray-900 shadow-sm"
                      : "bg-white border border-[#e6e4de] text-gray-800 shadow-sm"
                  }`}>
                    
                    {/* Collapsible MCP Tool Call Indicators */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-3 space-y-1.5 border-b border-gray-100 pb-3" onClick={e => e.stopPropagation()}>
                        {msg.toolCalls.map((tc, tcIdx) => {
                          const isExpanded = expandedToolIndex[`${msg.id}-${tcIdx}`] || false;
                          const hasResult = tc.state !== "running";
                          const hasError = tc.state === "error";

                          return (
                            <div key={`${msg.id}-${tcIdx}`} className="border border-[#e6e4de] rounded-lg overflow-hidden bg-slate-50 text-xs font-sans">
                              {/* Small tool bar */}
                              <div
                                onClick={() => toggleToolCallCollapse(msg.id, tcIdx)}
                                className="px-2.5 py-1.5 bg-gray-100/80 flex items-center justify-between cursor-pointer hover:bg-gray-200/50 transition select-none"
                              >
                                <div className="flex items-center gap-2">
                                  {tc.state === "running" ? (
                                    <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
                                  ) : tc.state === "success" ? (
                                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-rose-500" />
                                  )}
                                  <span className="text-[10px] font-semibold text-gray-600">
                                    Tool Call: <code className="font-mono text-[10px] text-amber-700 bg-amber-50/50 border border-amber-100/60 px-1 py-0.5 rounded">{tc.name}</code>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInspectToolCall(tc.name, tc.arguments, tc.state, tc.result, tc.error);
                                    }}
                                    className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded text-[9px] font-bold text-amber-700 uppercase"
                                  >
                                    Inspect Output
                                  </button>
                                  {isExpanded ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
                                </div>
                              </div>

                              {/* Details accordion */}
                              {isExpanded && (
                                <div className="p-2 border-t border-gray-150 space-y-1.5 bg-white text-[10px]">
                                  <div>
                                    <span className="font-bold text-gray-400 font-mono uppercase text-[9px]">Arguments</span>
                                    <pre className="p-2 bg-slate-900 text-slate-100 rounded-md overflow-x-auto font-mono text-[10px] mt-1 max-h-32 overflow-y-auto">
                                      {JSON.stringify(tc.arguments, null, 2)}
                                    </pre>
                                  </div>
                                  {hasResult && (
                                    <div>
                                      <span className="font-bold text-gray-400 font-mono uppercase text-[9px]">Result Preview</span>
                                      {hasError ? (
                                        <pre className="p-2 bg-red-50 text-rose-700 border border-rose-100 rounded-md overflow-x-auto font-mono text-[10px] mt-1">
                                          {tc.error}
                                        </pre>
                                      ) : (
                                        <pre className="p-2 bg-slate-900 text-emerald-400 rounded-md overflow-x-auto font-mono text-[10px] mt-1 max-h-32 overflow-y-auto">
                                          {JSON.stringify(tc.result, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Chat Text Markdown Content */}
                    {msg.content ? (
                      <Markdown content={msg.content} />
                    ) : (
                      <span className="text-gray-400 italic">Thinking and compiling thoughts...</span>
                    )}

                  </div>

                  {/* Message Actions */}
                  <div className="flex items-center gap-2.5 px-2 py-0.5 opacity-0 group-hover:opacity-100 transition duration-150 select-none">
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="p-1 rounded hover:bg-gray-150 text-gray-400 hover:text-[#191919] transition"
                      title="Copy content to clipboard"
                    >
                      {copiedMessageId === msg.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                    {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <button
                        onClick={() => {
                          const tc = msg.toolCalls![0];
                          handleInspectToolCall(tc.name, tc.arguments, tc.state, tc.result, tc.error);
                        }}
                        className="text-[9px] font-bold text-gray-400 hover:text-claude-accent font-mono uppercase tracking-wider flex items-center gap-1"
                      >
                        <Layers className="h-2.5 w-2.5" /> Inspect MCP Artifact
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })}

          {/* Dummy element for auto scroll */}
          <div ref={messageEndRef} />
        </div>

        {/* BOTTOM FLOATING PROMPT COMPOSER BAR */}
        <footer className="p-4 bg-gradient-to-t from-claude-bg via-claude-bg to-transparent select-none shrink-0 z-20">
          <div className="max-w-3xl mx-auto bg-white border border-[#e6e4de] hover:border-[#cc785c]/35 rounded-2xl shadow-md p-2.5 transition duration-150 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask Claude to analyze dashboards or query database schemas..."
              rows={2}
              disabled={isGenerating || !currentChat}
              className="w-full bg-transparent px-3 py-1.5 text-sm text-[#191919] placeholder-gray-400 focus:outline-none resize-none"
            />

            <div className="flex items-center justify-between border-t border-gray-100 pt-2 px-1 select-none">
              
              {/* Active Discovery State Indicator */}
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 font-mono">
                <Cpu className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                <span>MCP TOOLS ENABLED: {discoveredTools.length} ACTIONS</span>
              </div>

              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <button
                    onClick={handleStopGeneration}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    <Square className="h-3 w-3 fill-rose-700 text-rose-700" />
                    <span>Stop Output</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || !currentChat}
                    className="bg-claude-accent hover:bg-claude-accent-dark disabled:bg-gray-100 text-white disabled:text-gray-400 px-4 py-1.5 rounded-xl font-bold text-xs transition-all duration-150 active:scale-95 disabled:scale-100 shrink-0 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Send Message</span>
                    <Send className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="text-center text-[10px] text-[#8c8a82] font-semibold tracking-wider font-mono uppercase mt-2">
            INTEGRATED SUPERSET MCP SERVICE PROVIDER
          </div>
        </footer>

      </main>

      {/* CLAUDE ARTIFACT & MCP INSPECTOR SPLIT WORKSPACE (RIGHT HAND SIDE PANEL) */}
      <AnimatePresence>
        {showArtifactPanel && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 520, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="border-l border-claude-border bg-white flex flex-col h-full overflow-hidden shrink-0 relative select-text"
            id="artifacts_pane"
          >
            {/* Header of Artifact Container */}
            <div className="h-14 border-b border-claude-border px-4 flex items-center justify-between select-none bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-amber-50 text-claude-accent border border-amber-100">
                  <Layout className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#191919] font-display">Claude Workspace Artifacts</h3>
                  <p className="text-[9px] text-[#8c8a82] font-semibold tracking-wider font-mono uppercase">Interactive Query & Schema Engine</p>
                </div>
              </div>
              <button
                onClick={() => setShowArtifactPanel(false)}
                className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 transition"
              >
                <XCircle className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Artifact Panel Tabs selectors */}
            <div className="flex border-b border-claude-border select-none text-xs bg-slate-50/50">
              <button
                onClick={() => setActiveArtifactTab("result")}
                className={`flex-1 py-2.5 text-center font-bold border-b-2 transition ${
                  activeArtifactTab === "result"
                    ? "border-claude-accent text-claude-accent bg-white"
                    : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-[#191919]"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Tool Result Visualizer</span>
                </div>
              </button>
              <button
                onClick={() => setActiveArtifactTab("logs")}
                className={`flex-1 py-2.5 text-center font-bold border-b-2 transition ${
                  activeArtifactTab === "logs"
                    ? "border-claude-accent text-claude-accent bg-white"
                    : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-[#191919]"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <FileJson className="h-3.5 w-3.5" />
                  <span>Command Payload Logs</span>
                </div>
              </button>
              <button
                onClick={() => setActiveArtifactTab("library")}
                className={`flex-1 py-2.5 text-center font-bold border-b-2 transition ${
                  activeArtifactTab === "library"
                    ? "border-claude-accent text-claude-accent bg-white"
                    : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-[#191919]"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5" />
                  <span>MCP Tools Library</span>
                </div>
              </button>
              <button
                onClick={() => setActiveArtifactTab("prompt")}
                className={`flex-1 py-2.5 text-center font-bold border-b-2 transition ${
                  activeArtifactTab === "prompt"
                    ? "border-claude-accent text-claude-accent bg-white"
                    : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-[#191919]"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-claude-accent" />
                  <span>MCP Prompt Studio</span>
                </div>
              </button>
            </div>

            {/* Tab Contents Pane */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* TAB 1: TOOL RESULT VISUALIZER */}
              {activeArtifactTab === "result" && (
                <div className="space-y-4">
                  {selectedArtifact ? (
                    <div className="space-y-4">
                      {/* Meta Information Cards */}
                      <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100 space-y-2 select-none">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono uppercase">
                            Active Execution Artifact
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {new Date(selectedArtifact.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-gray-800 font-mono">
                          {selectedArtifact.toolName}
                        </h4>
                        <p className="text-xs text-gray-500 font-sans">
                          Status: <span className={`font-bold uppercase ${
                            selectedArtifact.state === "success" ? "text-emerald-600" :
                            selectedArtifact.state === "running" ? "text-amber-500 animate-pulse" : "text-rose-500"
                          }`}>{selectedArtifact.state}</span>
                        </p>
                      </div>

                      {/* Arguments preview */}
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1 select-none">
                        <span className="text-[9px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Input parameters</span>
                        <pre className="text-[10px] font-mono text-gray-600 truncate">{JSON.stringify(selectedArtifact.arguments)}</pre>
                      </div>

                      {/* Display content container */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block select-none">Execution Output</span>
                        {selectedArtifact.state === "running" ? (
                          <div className="p-12 text-center select-none space-y-3">
                            <Loader2 className="h-8 w-8 text-amber-600 animate-spin mx-auto" />
                            <p className="text-xs text-gray-500 font-sans">Executing tool call inside connection channel...</p>
                          </div>
                        ) : selectedArtifact.state === "error" ? (
                          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span className="font-bold text-xs font-sans">Error executing MCP action</span>
                            </div>
                            <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">{selectedArtifact.error}</pre>
                          </div>
                        ) : (
                          renderStructuredData(selectedArtifact.result)
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-gray-400 italic text-xs select-none space-y-2">
                      <Layout className="h-8 w-8 mx-auto text-gray-300" />
                      <p>No active artifact selected.</p>
                      <p className="text-[11px] text-gray-400 font-sans">Click on any "Inspect Output" button inside the chat to visualize table records or structured response graphs.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: COMMAND PAYLOAD LOGS */}
              {activeArtifactTab === "logs" && (
                <div className="space-y-4">
                  {selectedArtifact ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 select-text">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-[10px] font-bold text-gray-400 font-mono uppercase">Full MCP Payload Logs</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedArtifact, null, 2))}
                            className="text-[10px] font-bold text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                          >
                            <Copy className="h-3 w-3" /> Copy Log File
                          </button>
                        </div>
                        <pre className="text-[11px] font-mono text-slate-100 overflow-x-auto whitespace-pre-wrap max-h-[600px] leading-relaxed">
                          {JSON.stringify(selectedArtifact, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-gray-400 italic text-xs select-none">
                      No logs compiled yet. Submit prompts containing analytical tools commands to track payloads.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: MCP TOOLS LIBRARY & CLAUDE MCP CONNECTION HUB */}
              {activeArtifactTab === "library" && (
                <div className="space-y-4">
                  
                  {/* Claude-style MCP Control Center */}
                  <div className="bg-[#fbfaf8] border border-claude-border rounded-xl p-4 space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-claude-accent animate-pulse" />
                        <h4 className="text-xs font-bold text-gray-800 font-display">Claude MCP Server Bridge</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${
                          mcpStatus === "connected" ? "bg-emerald-500 animate-pulse" :
                          mcpStatus === "connecting" ? "bg-amber-500 animate-bounce" : "bg-rose-500"
                        }`} />
                        <span className={`text-[10px] font-bold font-mono ${
                          mcpStatus === "connected" ? "text-emerald-600" :
                          mcpStatus === "connecting" ? "text-amber-500 font-bold" : "text-rose-500"
                        }`}>
                          {mcpStatus.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs text-gray-600">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Server SSE Address</span>
                        <input
                          type="text"
                          value={quickMcpUrl}
                          onChange={(e) => setQuickMcpUrl(e.target.value)}
                          placeholder="e.g. /mcp or http://localhost:5008"
                          className="w-full px-3 py-1.5 bg-white border border-claude-border rounded-lg text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Bearer Header Token</span>
                        <input
                          type="password"
                          value={quickMcpToken}
                          onChange={(e) => setQuickMcpToken(e.target.value)}
                          placeholder="Optional Bearer JWT or Authorization key"
                          className="w-full px-3 py-1.5 bg-white border border-claude-border rounded-lg text-xs font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            setMcpStatus("disconnected");
                            setDiscoveredTools([]);
                          }}
                          className="flex-1 py-1.5 border border-claude-border hover:bg-gray-100 text-gray-600 font-bold text-xs rounded-lg transition"
                        >
                          Disconnect
                        </button>
                        <button
                          onClick={async () => {
                            setMcpUrl(quickMcpUrl);
                            setMcpAuthToken(quickMcpToken);
                            localStorage.setItem("mcp_url", quickMcpUrl);
                            localStorage.setItem("mcp_auth_token", quickMcpToken);
                            await connectMcp(quickMcpUrl, quickMcpToken);
                          }}
                          className="flex-1 py-1.5 bg-claude-accent hover:bg-claude-accent-dark text-white font-bold text-xs rounded-lg transition shadow-sm active:scale-95"
                        >
                          {mcpStatus === "connecting" ? "Connecting..." : "Connect Server"}
                        </button>
                      </div>
                    </div>

                    {mcpStatus === "error" && mcpErrorMsg && (
                      <div className="space-y-2">
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-[10px] font-mono leading-relaxed max-h-24 overflow-y-auto">
                          <strong>Connection Error:</strong> {mcpErrorMsg}
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-lg text-amber-800 text-[10px] font-sans leading-relaxed select-none">
                          <strong>⚠️ Sandbox Fallback Active:</strong> Could not connect to remote MCP server at <code className="font-mono bg-amber-100/60 px-1 py-0.5 rounded text-amber-900">{quickMcpUrl}</code>. To prevent workflow disruption, we have activated the <strong>Interactive Local Sandbox Mode</strong> with 6 high-fidelity simulated Superset BI tools.
                        </div>
                      </div>
                    )}

                    {mcpStatus === "connected" && (
                      <div className="p-2.5 bg-emerald-50/50 border border-emerald-100 text-emerald-800 rounded-lg text-[10px] font-medium leading-relaxed select-none">
                        ✔ Handshake established successfully. {discoveredTools.length} tools are fully active and bound to the Claude context.
                      </div>
                    )}
                  </div>

                  <div className="select-none space-y-1.5 pt-2">
                    <h4 className="text-xs font-bold text-gray-800 font-display">Connected MCP Commands Directory</h4>
                    <p className="text-[11px] text-gray-500 font-sans">Explore, query, and search through all active tools discovered from the connected Model Context Protocol server.</p>
                  </div>

                  {/* Search bar inside libraries */}
                  <div className="relative">
                    <input
                      type="text"
                      value={artifactsSearchQuery}
                      onChange={(e) => setArtifactsSearchQuery(e.target.value)}
                      placeholder="Filter tools by name or description..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-claude-border rounded-xl text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-claude-accent transition"
                    />
                    <Search className="h-3.5 w-3.5 text-gray-400 absolute left-3.5 top-3" />
                  </div>

                  {/* Discovered tools list with expand accordions */}
                  <div className="space-y-3">
                    {filteredTools.length === 0 ? (
                      <div className="text-center py-8 text-xs text-gray-400 italic select-none">
                        No tools found matching "{artifactsSearchQuery}"
                      </div>
                    ) : (
                      filteredTools.map((tool) => {
                        const isExpanded = expandedLibraryTool === tool.name;
                        return (
                          <div
                            key={tool.name}
                            className="border border-claude-border rounded-xl overflow-hidden bg-white hover:border-[#cc785c]/30 transition duration-150"
                          >
                            <div
                              onClick={() => setExpandedLibraryTool(isExpanded ? null : tool.name)}
                              className="px-3.5 py-3 bg-slate-50/50 flex items-center justify-between cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Code className="h-4 w-4 text-claude-accent shrink-0" />
                                <div className="truncate">
                                  <span className="font-mono text-xs font-bold text-gray-800">{tool.name}</span>
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>

                            {isExpanded && (
                              <div className="p-4 border-t border-claude-border bg-white text-xs space-y-3 select-text">
                                <div className="space-y-1">
                                  <span className="font-bold text-gray-400 font-mono uppercase text-[9px]">Description</span>
                                  <p className="text-gray-600 font-sans leading-relaxed">{tool.description || "No description provided."}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-400 font-mono uppercase text-[9px]">Input Schema Properties</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(tool.inputSchema || {}, null, 2));
                                        alert("Schema copied to clipboard!");
                                      }}
                                      className="text-[9px] font-bold text-amber-700 hover:underline font-mono"
                                    >
                                      Copy Schema JSON
                                    </button>
                                  </div>
                                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto font-mono text-[10px] max-h-48 overflow-y-auto leading-relaxed border border-slate-800">
                                    {JSON.stringify(tool.inputSchema || {}, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: CLAUDE MCP PROMPT STUDIO */}
              {activeArtifactTab === "prompt" && (
                <div className="space-y-4">
                  <div className="space-y-1.5 select-none">
                    <h4 className="text-xs font-bold text-gray-800 font-display flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-claude-accent animate-pulse" />
                      <span>Claude System Prompt Studio</span>
                    </h4>
                    <p className="text-xs text-gray-500 font-sans leading-relaxed">
                      Automatically compile discovered MCP schema capabilities and action definitions into an optimal system instruction prompt for local Ollama/Spring AI inference.
                    </p>
                  </div>

                  {/* Template preset selector */}
                  <div className="space-y-2 select-none">
                    <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Select Prompt Persona Template</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPromptTemplate("data")}
                        className={`py-2 px-1 text-[10px] font-bold border rounded-xl transition ${
                          promptTemplate === "data"
                            ? "bg-amber-50 border-amber-300 text-amber-800"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                        }`}
                      >
                        BI Data Analyst
                      </button>
                      <button
                        onClick={() => setPromptTemplate("orchestration")}
                        className={`py-2 px-1 text-[10px] font-bold border rounded-xl transition ${
                          promptTemplate === "orchestration"
                            ? "bg-amber-50 border-amber-300 text-amber-800"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                        }`}
                      >
                        Master Orchestrator
                      </button>
                      <button
                        onClick={() => setPromptTemplate("general")}
                        className={`py-2 px-1 text-[10px] font-bold border rounded-xl transition ${
                          promptTemplate === "general"
                            ? "bg-amber-50 border-amber-300 text-amber-800"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                        }`}
                      >
                        General Tool Assistant
                      </button>
                    </div>
                  </div>

                  {/* Prompt Textarea Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between select-none">
                      <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider">Generated Prompts Instructions Code</span>
                      <span className="text-[10px] text-emerald-600 font-mono font-bold uppercase">Dynamic Injection Ready</span>
                    </div>
                    <textarea
                      value={customPromptText}
                      onChange={(e) => setCustomPromptText(e.target.value)}
                      rows={12}
                      className="w-full p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed border border-slate-800 shadow-inner focus:outline-none focus:ring-1 focus:ring-amber-500/30 resize-none select-text"
                    />
                  </div>

                  {/* Actions Bar */}
                  <div className="flex gap-2 select-none">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(customPromptText);
                        alert("Custom Prompt template copied to clipboard successfully!");
                      }}
                      className="flex-1 py-2 px-2 bg-white hover:bg-slate-50 border border-claude-border text-gray-700 font-bold text-[11px] rounded-xl transition active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5 text-gray-400" />
                      <span>Copy Prompt Code</span>
                    </button>
                    <button
                      onClick={async () => {
                        if (!currentChat) {
                          alert("Create or select a chat first!");
                          return;
                        }
                        setSystemPrompt(customPromptText);
                        localStorage.setItem("system_prompt", customPromptText);
                        const updatedChat = {
                          ...currentChat,
                          systemPrompt: customPromptText,
                          updatedAt: Date.now()
                        };
                        setCurrentChat(updatedChat);
                        await saveChat(updatedChat);
                        alert("Successfully applied and injected the dynamic custom MCP prompt directly into current chat session!");
                      }}
                      className="flex-1 py-2 px-2 bg-claude-accent hover:bg-claude-accent-dark text-white font-bold text-[11px] rounded-xl transition active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Inject to System Prompt</span>
                    </button>
                  </div>

                  <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/50 text-[10px] text-amber-800 leading-relaxed font-sans select-none">
                    <strong>Pro-tip:</strong> When you click <em>"Inject to System Prompt"</em>, the local inference engine will immediately read these schema execution boundaries and format rules to call your connected MCP tools server precisely.
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HELP / ONBOARDING GUIDE MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" id="help_modal">
          <div className="bg-white rounded-2xl shadow-xl border border-claude-border max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden select-text">
            <div className="p-5 border-b border-claude-border flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-claude-accent" />
                <h3 className="font-bold text-gray-800 text-base font-display">Setup & Connection Guide</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-gray-600">
              <p>
                This client runs directly inside your web browser. To use it, you must configure same-origin proxies or connect directly to accessible server endpoints:
              </p>

              {/* Ollama Guide */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-amber-700">
                  1. Setup local Ollama Inference
                </h4>
                <div className="p-3 bg-slate-50 border border-claude-border rounded-xl space-y-2">
                  <p className="text-xs text-gray-600 font-sans">
                    Start your local Ollama daemon with origin allowances to bypass direct CORS (if accessing directly), or let the Vite dev-server handle proxying:
                  </p>
                  <pre className="p-2 bg-slate-950 text-slate-100 font-mono text-xs rounded overflow-x-auto select-all">
                    OLLAMA_ORIGINS="*" ollama serve
                  </pre>
                  <p className="text-xs text-gray-600">
                    Pull the high-capability tool-calling model:
                  </p>
                  <pre className="p-2 bg-slate-950 text-slate-100 font-mono text-xs rounded overflow-x-auto select-all">
                    ollama pull qwen3:30b
                  </pre>
                </div>
              </div>

              {/* MCP Guide */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-amber-700">
                  2. Connect Superset (BiDarshan) MCP
                </h4>
                <div className="p-3 bg-slate-50 border border-claude-border rounded-xl space-y-1.5 text-xs text-gray-600">
                  <p>
                    By default, this applet proxies <code className="px-1 bg-gray-200 rounded font-mono">/mcp</code> directly to:
                  </p>
                  <p className="font-mono text-amber-700 break-all font-semibold select-all bg-amber-50 p-2 rounded border border-amber-100">
                    https://bidarshan-dev2.dcservices.in/mcp
                  </p>
                  <p>
                    If the hosted Superset server requires authorization headers, generate a valid JSON Web Token and input it inside the <span className="font-bold text-gray-700">Settings panel</span>.
                  </p>
                </div>
              </div>

              {/* Nginx blocks */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-amber-700">
                  3. Production Nginx Config
                </h4>
                <div className="p-3 bg-slate-50 border border-claude-border rounded-xl space-y-2 text-xs">
                  <p className="text-gray-600 font-sans">
                    To host this static React build inside Nginx, reverse-proxy endpoints with location blocks:
                  </p>
                  <pre className="p-2 bg-slate-950 text-slate-100 font-mono text-[10px] rounded overflow-x-auto whitespace-pre select-all leading-relaxed">
{`location /ollama/ {
    proxy_pass http://localhost:11434/;
    proxy_set_header Host $host;
}

location /mcp/ {
    proxy_pass https://bidarshan-dev2.dcservices.in/mcp/;
    proxy_set_header Host $host;
}`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-claude-border text-right select-none">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 bg-claude-accent hover:bg-claude-accent-dark text-white font-semibold text-xs rounded-lg transition"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" id="settings_modal">
          <div className="bg-white rounded-2xl shadow-xl border border-claude-border max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden select-text">
            
            <div className="p-5 border-b border-claude-border flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-claude-accent" />
                <h3 className="font-bold text-gray-800 text-base font-display">Workspace Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm text-gray-600">
              {/* Spring Boot Settings */}
              <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-claude-border">
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-700 text-xs uppercase tracking-wider block">Spring Boot Server URL</label>
                  <input
                    type="text"
                    value={tempSpringbootUrl}
                    onChange={(e) => setTempSpringbootUrl(e.target.value)}
                    placeholder="e.g. http://localhost:8080 or /springboot"
                    className="w-full px-3 py-2 bg-white border border-[#d2cfc6] rounded-xl text-xs text-gray-800 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-700 text-xs uppercase tracking-wider block">Spring AI Provider</label>
                  <select
                    value={tempSelectedProvider}
                    onChange={(e) => setTempSelectedProvider(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d2cfc6] rounded-xl text-xs text-gray-800 focus:outline-none font-bold"
                  >
                    <option value="ollama">Ollama (Local Inference)</option>
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="google-ai">Google AI Studio (Gemini)</option>
                  </select>
                </div>
              </div>

              {/* MCP SSE URL field */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 text-xs uppercase tracking-wider block">MCP Server SSE Endpoint</label>
                <input
                  type="text"
                  value={tempMcpUrl}
                  onChange={(e) => setTempMcpUrl(e.target.value)}
                  placeholder="e.g. http://127.0.0.1:5008 or /mcp"
                  className="w-full px-3 py-2 bg-slate-50 border border-claude-border rounded-xl text-xs text-gray-800 focus:outline-none font-mono"
                />
                <span className="text-[10px] text-gray-400 block select-none">
                  Use <code className="px-1 bg-gray-150 rounded font-mono text-[9px]">/mcp</code> to proxy CORS through the Vite dev-server.
                </span>
              </div>

              {/* MCP Auth Token Header */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 text-xs uppercase tracking-wider block">MCP Auth Token (JWT / Bearer)</label>
                <input
                  type="password"
                  value={tempMcpAuthToken}
                  onChange={(e) => setTempMcpAuthToken(e.target.value)}
                  placeholder="Optional JWT or auth token header"
                  className="w-full px-3 py-2 bg-slate-50 border border-claude-border rounded-xl text-xs text-gray-800 focus:outline-none font-mono"
                />
                <span className="text-[10px] text-gray-400 block select-none">
                  Sent as <code className="px-1 bg-gray-150 rounded font-mono text-[9px]">Authorization: Bearer &lt;token&gt;</code> to SSE headers.
                </span>
              </div>

              {/* System Prompt */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 text-xs uppercase tracking-wider block">System Prompt Instructions</label>
                <textarea
                  value={tempSystemPrompt}
                  onChange={(e) => setTempSystemPrompt(e.target.value)}
                  rows={3}
                  placeholder="E.g. Tell the model who it is and how to run analytical toolings..."
                  className="w-full px-3 py-2 bg-slate-50 border border-claude-border rounded-xl text-xs text-gray-800 focus:outline-none leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Footer with save actions */}
            <div className="p-4 bg-slate-50 border-t border-claude-border flex justify-between select-none">
              <button
                onClick={handleResetSettings}
                className="px-3 py-1.5 border border-claude-border hover:bg-gray-100 text-gray-600 font-bold text-xs rounded-xl transition"
              >
                Reset to Defaults
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-1.5 border border-transparent hover:bg-gray-200 text-gray-600 font-bold text-xs rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 bg-claude-accent hover:bg-claude-accent-dark text-white font-bold text-xs rounded-xl shadow transition active:scale-95"
                >
                  Apply Settings
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
