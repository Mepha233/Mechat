export type AuthUser = {
  id: string;
  username: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type RagSource = {
  chunkId: string;
  section: string;
  source: string;
  distance: number | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: RagSource[];
  createdAt: string;
};

// /api/chat 按行发送的事件；检索进度、回答片段和最终保存结果共用此协议。
export type ChatStreamEvent =
  | { type: "searching" }
  | { type: "retrieved"; count: number }
  | { type: "delta"; text: string }
  | { type: "saving" }
  | {
      type: "done";
      conversationId: string;
      answer: string;
      sources: RagSource[];
    }
  | { type: "error"; error: string };

export type ChatGenerationStatus = {
  phase: "searching" | "retrieved" | "answering" | "saving" | "completed";
  count?: number;
};
