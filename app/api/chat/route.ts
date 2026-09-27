import { z } from "zod";

import {
  requireSessionUser,
  UnauthorizedError,
} from "@/lib/server/auth";
import {
  getRecentHistory,
  saveExchange,
} from "@/lib/server/conversations";
import { streamAnswerWithRag } from "@/lib/server/rag";
import type { ChatStreamEvent, RagSource } from "@/lib/types";

export const runtime = "nodejs";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  conversationId: z.uuid().optional(),
});

function failureMessage(error: unknown) {
  const isDatabaseError =
    error instanceof Error &&
    /DATABASE_URL|ECONNREFUSED|PostgreSQL|database/i.test(error.message);

  return isDatabaseError
    ? "无法连接 PostgreSQL，请先启动数据库并执行 npm run db:migrate。"
    : "生成回答失败，请检查阿里云百炼配置、Chroma 和服务器日志。";
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const parsed = chatSchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { error: "消息为空、过长或会话 ID 格式不正确。" },
        { status: 400 },
      );
    }

    const { message, conversationId } = parsed.data;
    const history = conversationId
      ? await getRecentHistory(user.id, conversationId)
      : [];

    if (history === null) {
      return Response.json({ error: "没有找到该会话。" }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    request.signal.addEventListener("abort", abort, { once: true });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: ChatStreamEvent) => {
          if (!abortController.signal.aborted) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        };

        void (async () => {
          try {
            send({ type: "searching" });
            let sources: RagSource[] = [];
            let answer = "";

            for await (const text of streamAnswerWithRag(
              message,
              history,
              (foundSources) => {
                sources = foundSources;
                send({ type: "retrieved", count: foundSources.length });
              },
              abortController.signal,
            )) {
              answer += text;
              send({ type: "delta", text });
            }

            if (!answer.trim()) {
              throw new Error("模型没有返回可用的回答。");
            }

            // 完整回答成功后才入库；流中断时不会保存半条对话。
            send({ type: "saving" });
            const resolvedConversationId = await saveExchange({
              userId: user.id,
              conversationId,
              userMessage: message,
              assistantMessage: answer,
              sources,
            });

            send({
              type: "done",
              conversationId: resolvedConversationId,
              answer,
              sources,
            });
          } catch (error) {
            if (!abortController.signal.aborted) {
              console.error("聊天请求失败", error);
              send({ type: "error", error: failureMessage(error) });
            }
          } finally {
            request.signal.removeEventListener("abort", abort);
            if (!abortController.signal.aborted) {
              controller.close();
            }
          }
        })();
      },
      cancel() {
        request.signal.removeEventListener("abort", abort);
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }

    console.error("聊天请求失败", error);
    return Response.json(
      { error: failureMessage(error) },
      { status: 503 },
    );
  }
}
