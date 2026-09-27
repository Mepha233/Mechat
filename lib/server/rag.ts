import "server-only";

import { ChromaClient, type Metadata } from "chromadb";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

import type { RagSource } from "@/lib/types";
import type { StoredHistoryMessage } from "@/lib/server/conversations";

type RetrievedChunk = {
  chunkId: string;
  section: string;
  source: string;
  content: string;
  distance: number | null;
  rerankScore: number;
};

const dashScopeBaseUrl =
  process.env.DASHSCOPE_BASE_URL ??
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

function getDashScopeApiKey() {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "缺少 DASHSCOPE_API_KEY，请在服务器环境变量中配置阿里云百炼 API Key。",
    );
  }

  return apiKey;
}

function createEmbeddings() {
  return new OpenAIEmbeddings({
    model:
      process.env.DASHSCOPE_EMBEDDING_MODEL ??
      "qwen3.7-text-embedding-flash",
    apiKey: getDashScopeApiKey(),
    encodingFormat: "float",
    maxRetries: 1,
    configuration: {
      baseURL: dashScopeBaseUrl,
    },
  });
}

function createChatModel() {
  return new ChatOpenAI({
    model: process.env.DASHSCOPE_CHAT_MODEL ?? "qwen-plus",
    apiKey: getDashScopeApiKey(),
    temperature: 0,
    maxRetries: 1,
    useResponsesApi: false,
    configuration: {
      baseURL: dashScopeBaseUrl,
    },
  });
}

const chromaClient = new ChromaClient({
  host: process.env.CHROMA_HOST ?? "127.0.0.1",
  port: Number(process.env.CHROMA_PORT ?? 8000),
  ssl: process.env.CHROMA_SSL === "true",
});

const SYSTEM_PROMPT = `你是 Mechat，一个知识库问答助手。

回答规则：
1. 优先根据“RAG 参考资料”回答，并准确理解资料的章节和内容。
2. 不要编造参考资料中不存在的出处。
3. 如果参考资料不足以判断或回答，允许使用模型自身已有知识，但回答必须先明确写出：
“无法根据知识库内容回答，请提示管理员更新知识库。以下是模型自有数据回答内容：”
4. 如果模型自身也无法确认，应直接说明无法确认，不要猜测。
5. 回答保持清晰、简洁，并结合已有对话历史理解追问。`;

const prompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_PROMPT],
  new MessagesPlaceholder("history"),
  [
    "human",
    `RAG 参考资料：
{context}

当前问题：
{query}`,
  ],
]);

function metadataText(metadata: Metadata | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function rerankChunk(
  query: string,
  content: string,
  section: string,
  distance: number | null,
) {
  let score = distance ?? 10;
  const asksForLocation = /(哪里|哪儿|位置|位于|什么地方)/.test(query);

  if (asksForLocation && content.includes("位于")) {
    score -= 0.22;
  }
  if (asksForLocation && section.includes("世界观")) {
    score -= 0.12;
  }
  if (asksForLocation && section.includes("登场角色")) {
    score += 0.08;
  }

  return score;
}

async function retrieveChunks(query: string, limit = 4) {
  const collection = await chromaClient.getCollection({
    name: process.env.CHROMA_COLLECTION ?? "wiki_knowledge_v1",
  });
  const queryEmbedding = await createEmbeddings().embedQuery(query);
  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 20,
  });

  const ids = result.ids[0] ?? [];
  const documents = result.documents?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  const chunks: RetrievedChunk[] = ids.map((id, index) => {
    const metadata = metadatas[index] ?? null;
    const content = documents[index] ?? "";
    const section = metadataText(metadata, "section");
    const distance = distances[index] ?? null;

    return {
      chunkId: metadataText(metadata, "chunk_id") || id,
      section,
      source: metadataText(metadata, "source"),
      content,
      distance,
      rerankScore: rerankChunk(query, content, section, distance),
    };
  });

  const uniqueChunks = new Map<string, RetrievedChunk>();

  for (const chunk of chunks.sort((a, b) => a.rerankScore - b.rerankScore)) {
    if (chunk.content && !uniqueChunks.has(chunk.chunkId)) {
      uniqueChunks.set(chunk.chunkId, chunk);
    }
  }

  return [...uniqueChunks.values()].slice(0, limit);
}

function formatContext(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return "当前检索没有返回可用的知识库资料。";
  }

  return chunks
    .map(
      (chunk, index) => `[资料 ${index + 1}]
章节：${chunk.section || "未知"}
来源：${chunk.source || "未知"}
内容：
${chunk.content}`,
    )
    .join("\n\n");
}

function formatHistory(history: StoredHistoryMessage[]) {
  return history.map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );
}

function responseText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  return String(content ?? "");
}

export async function* streamAnswerWithRag(
  query: string,
  history: StoredHistoryMessage[],
  onRetrieved: (sources: RagSource[]) => void,
  signal?: AbortSignal,
) {
  let chunks: RetrievedChunk[] = [];

  try {
    chunks = await retrieveChunks(query);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.error("Chroma 检索失败，将使用模型自身知识回答。", error);
  }

  const sources: RagSource[] = chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    section: chunk.section,
    source: chunk.source,
    distance: chunk.distance,
  }));

  onRetrieved(sources);

  const response = await prompt.pipe(createChatModel()).stream(
    {
      context: formatContext(chunks),
      history: formatHistory(history),
      query,
    },
    { signal },
  );

  for await (const chunk of response) {
    const text = responseText(chunk.content);
    if (text) {
      yield text;
    }
  }
}
