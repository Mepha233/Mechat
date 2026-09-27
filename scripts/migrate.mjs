import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  throw new Error("缺少 DATABASE_URL，请先配置 .env.local。");
}

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
const schema = await readFile(schemaPath, "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(schema);
  console.log("PostgreSQL 表结构初始化完成。");
} finally {
  await pool.end();
}
