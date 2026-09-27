import {
  requireSessionUser,
  UnauthorizedError,
} from "@/lib/server/auth";
import { getConversationMessages } from "@/lib/server/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { conversationId } = await params;
    const messages = await getConversationMessages(user.id, conversationId);

    if (!messages) {
      return Response.json({ error: "没有找到该会话。" }, { status: 404 });
    }

    return Response.json({ messages });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }

    console.error("读取会话消息失败", error);
    return Response.json(
      { error: "读取历史消息失败，请检查 PostgreSQL 服务。" },
      { status: 503 },
    );
  }
}
