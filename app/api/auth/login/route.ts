import { z } from "zod";

import {
  createSession,
  getDemoUser,
  verifyDemoCredentials,
} from "@/lib/server/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { error: "请输入用户名和密码。" },
        { status: 400 },
      );
    }

    if (!verifyDemoCredentials(parsed.data.username, parsed.data.password)) {
      return Response.json(
        { error: "用户名或密码错误。" },
        { status: 401 },
      );
    }

    const user = getDemoUser();
    await createSession(user);

    return Response.json({ user });
  } catch (error) {
    console.error("登录失败", error);
    return Response.json(
      { error: "登录服务配置不完整。" },
      { status: 500 },
    );
  }
}
