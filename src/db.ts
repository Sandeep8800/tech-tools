import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface Chat {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCallState {
  name: string;
  arguments: any;
  result?: any;
  error?: string;
  state: "running" | "success" | "error";
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallState[];
}

interface TTSAssistantDB extends DBSchema {
  chats: {
    key: string;
    value: Chat;
    indexes: { "by-updated": number };
  };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { "by-chat": string };
  };
}

let dbPromise: Promise<IDBPDatabase<TTSAssistantDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TTSAssistantDB>("tts-assistant-db", 1, {
      upgrade(db) {
        // Create chats store
        const chatsStore = db.createObjectStore("chats", { keyPath: "id" });
        chatsStore.createIndex("by-updated", "updatedAt");

        // Create messages store
        const messagesStore = db.createObjectStore("messages", { keyPath: "id" });
        messagesStore.createIndex("by-chat", "chatId");
      },
    });
  }
  return dbPromise;
}

export async function getAllChats(): Promise<Chat[]> {
  const db = await getDb();
  const chats = await db.getAllFromIndex("chats", "by-updated");
  return chats.reverse(); // Return newest first
}

export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDb();
  await db.put("chats", chat);
}

export async function deleteChat(chatId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["chats", "messages"], "readwrite");
  await tx.objectStore("chats").delete(chatId);
  
  const messagesStore = tx.objectStore("messages");
  const index = messagesStore.index("by-chat");
  let cursor = await index.openCursor(IDBKeyRange.only(chatId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const messages = await db.getAllFromIndex("messages", "by-chat");
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("messages", "readwrite");
  const store = tx.objectStore("messages");
  for (const msg of messages) {
    await store.put(msg);
  }
  await tx.done;
}

export async function saveSingleMessage(message: ChatMessage): Promise<void> {
  const db = await getDb();
  await db.put("messages", message);
}
