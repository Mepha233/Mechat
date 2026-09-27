import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

import type { AuthUser } from "@/lib/types";

const SESSION_COOKIE = "mechat_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getSessionSecret() {
  const value = process.env.SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET 必须至少包含 32 个字符。");
  }

  return new TextEncoder().encode(value);
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function verifyDemoCredentials(username: string, password: string) {
  const expectedUsername = process.env.DEMO_USERNAME ?? "mepha";
  const expectedPassword = process.env.DEMO_PASSWORD;

  if (!expectedPassword) {
    throw new Error("缺少 DEMO_PASSWORD 环境变量。");
  }

  return (
    safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword)
  );
}

export function getDemoUser(): AuthUser {
  return {
    id: process.env.DEMO_USER_ID ?? "demo-mepha",
    username: process.env.DEMO_USERNAME ?? "mepha",
  };
}

export async function createSession(user: AuthUser) {
  const token = await new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  const secureCookie =
    process.env.SESSION_COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.SESSION_COOKIE_SECURE !== "false");

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
    });

    if (!payload.sub || typeof payload.username !== "string") {
      return null;
    }

    return {
      id: payload.sub,
      username: payload.username,
    };
  } catch {
    return null;
  }
}

export async function requireSessionUser() {
  const user = await getSessionUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("请先登录。");
    this.name = "UnauthorizedError";
  }
}
