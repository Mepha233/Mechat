import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type {
  ChatMessage,
  ConversationSummary,
  RagSource,
} from "@/lib/types";
import { query, withTransaction } from "@/lib/server/db";

type ConversationRow = {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: RagSource[] | null;
  created_at: Date;
};

export type StoredHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function toConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: String(row.id),
    role: row.role,
    content: row.content,
    sources: Array.isArray(row.sources) ? row.sources : [],
    createdAt: row.created_at.toISOString(),
  };
}

export async function listConversations(userId: string) {
  const result = await query<ConversationRow>(
    `SELECT id, title, created_at, updated_at
       FROM conversations
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 100`,
    [userId],
  );

  return result.rows.map(toConversation);
}

export async function getConversationMessages(
  userId: string,
  conversationId: string,
) {
  const owner = await query<{ id: string }>(
    `SELECT id
       FROM conversations
      WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );

  if (owner.rowCount === 0) {
    return null;
  }

  const result = await query<MessageRow>(
    `SELECT id, role, content, sources, created_at
       FROM messages
      WHERE conversation_id = $1 AND user_id = $2
      ORDER BY id ASC`,
    [conversationId, userId],
  );

  return result.rows.map(toMessage);
}

export async function getRecentHistory(
  userId: string,
  conversationId: string,
  limit = 16,
): Promise<StoredHistoryMessage[] | null> {
  const owner = await query<{ id: string }>(
    `SELECT id
       FROM conversations
      WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );

  if (owner.rowCount === 0) {
    return null;
  }

  const result = await query<StoredHistoryMessage>(
    `SELECT role, content
       FROM (
         SELECT id, role, content
           FROM messages
          WHERE conversation_id = $1 AND user_id = $2
          ORDER BY id DESC
          LIMIT $3
       ) recent_messages
      ORDER BY id ASC`,
    [conversationId, userId, limit],
  );

  return result.rows;
}

function createTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 30
    ? `${normalized.slice(0, 30)}…`
    : normalized || "新对话";
}

async function assertConversationOwner(
  client: PoolClient,
  conversationId: string,
  userId: string,
) {
  const result = await client.query(
    `SELECT id
       FROM conversations
      WHERE id = $1 AND user_id = $2
      FOR UPDATE`,
    [conversationId, userId],
  );

  if (result.rowCount === 0) {
    throw new Error("找不到该会话，或当前用户没有访问权限。");
  }
}

export async function saveExchange({
  userId,
  conversationId,
  userMessage,
  assistantMessage,
  sources,
}: {
  userId: string;
  conversationId?: string;
  userMessage: string;
  assistantMessage: string;
  sources: RagSource[];
}) {
  const resolvedConversationId = conversationId ?? randomUUID();

  await withTransaction(async (client) => {
    if (conversationId) {
      await assertConversationOwner(client, conversationId, userId);
    } else {
      await client.query(
        `INSERT INTO conversations (id, user_id, title)
         VALUES ($1, $2, $3)`,
        [resolvedConversationId, userId, createTitle(userMessage)],
      );
    }

    await client.query(
      `INSERT INTO messages (conversation_id, user_id, role, content)
       VALUES ($1, $2, 'user', $3)`,
      [resolvedConversationId, userId, userMessage],
    );

    await client.query(
      `INSERT INTO messages (
         conversation_id,
         user_id,
         role,
         content,
         sources
       )
       VALUES ($1, $2, 'assistant', $3, $4::jsonb)`,
      [
        resolvedConversationId,
        userId,
        assistantMessage,
        JSON.stringify(sources),
      ],
    );

    await client.query(
      `UPDATE conversations
          SET updated_at = NOW()
        WHERE id = $1`,
      [resolvedConversationId],
    );
  });

  return resolvedConversationId;
}