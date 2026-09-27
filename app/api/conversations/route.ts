import {
  requireSessionUser,
  UnauthorizedError,
} from "@/lib/server/auth";
import { listConversations } from "@/lib/server/conversations";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const conversations = await listConversations(user.id);
    return Response.json({ conversations });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }

    console.error("读取会话列表失败", error);
    return Response.json(
      { error: "无法连接 PostgreSQL，请检查 DATABASE_URL 和数据库服务。" },
      { status: 503 },
    );
  }
}