# Mechat

这是一个基于 Next.js App Router 的本地全栈 RAG 对话练习项目。

## 请求流程

```text
React 页面
  -> Next.js Route Handler（登录、会话、聊天接口）
  -> PostgreSQL（会话和消息历史）
  -> Chroma（检索相关 chunk）
  -> LangChain.js + 阿里云百炼（查询向量并调用千问聊天模型）
  -> PostgreSQL（保存本轮用户消息、回答和引用）
  -> React 页面（流式展示检索进度和模型回答）
```

LangChain 和 Next.js 不冲突。Next.js 是 HTTP 接口与页面运行环境，LangChain 只在服务端 Route Handler 中负责提示词、历史消息和模型调用。

## 本地配置

复制 `.env.example` 为 `.env.local`，至少配置：

- `DEMO_USERNAME`、`DEMO_PASSWORD`：当前本地演示账号。
- `SESSION_SECRET`：至少 32 个字符，用于签发登录 Cookie。
- `SESSION_COOKIE_SECURE=false`：本地 HTTP 使用 `false`；正式 HTTPS 部署改为 `true`。
- `DATABASE_URL`：PostgreSQL 连接字符串。
- `DASHSCOPE_API_KEY`：阿里云百炼 API Key，只配置在本地或服务器环境变量中。
- `DASHSCOPE_BASE_URL`：百炼 OpenAI 兼容接口地址；业务空间有专属地址时应替换为对应地域的地址。
- `DASHSCOPE_CHAT_MODEL`：聊天模型，默认使用 `qwen-plus`。
- `DASHSCOPE_EMBEDDING_MODEL`：查询向量模型，默认使用 `qwen3.7-text-embedding-flash`。
- `CHROMA_*`：Chroma 服务和 collection 名称。

`.env.local` 已被 Git 忽略，不要把真实密码或密钥提交到仓库。

部署模板统一使用 `/opt/mechat`、`/etc/mechat`、`mechat.service` 和新建的 `mechat` 数据库。已有服务器若仍使用旧路径、旧服务或旧数据库，须先迁移数据与服务配置；不要直接运行安装脚本覆盖现有部署。本地已有数据库可继续通过 `DATABASE_URL` 连接，不要求为项目更名而重建。

## 启动顺序

1. 启动 PostgreSQL，并创建 `.env.local` 的 `DATABASE_URL` 所指定的数据库（新环境示例名为 `mechat`）。
2. 初始化会话表：

   ```powershell
   npm run db:migrate
   ```

3. 在 `.env.local` 中配置阿里云百炼 API Key、兼容接口地址以及模型名称。API Key 与接口地域必须一致。
4. 使用与 `DASHSCOPE_EMBEDDING_MODEL` 相同的模型重新生成知识库向量，然后启动 Chroma HTTP 服务，并确保 collection 名称与 `CHROMA_COLLECTION` 一致。不同嵌入模型生成的向量不能混用，即使向量维度相同也必须重新构建 collection。Next.js 不能直接读取 Python Chroma 的本地目录，它通过 HTTP 客户端访问 Chroma 服务。
5. 启动开发服务器：

   ```powershell
   npm run dev
   ```

6. 打开 `http://localhost:3000`。未登录时页面会强制显示登录弹窗。

## 数据边界

- 当前账号是环境变量中的单一本地演示账号，不是正式用户系统。
- Cookie 使用签名 JWT，并设置为 `HttpOnly`；聊天、会话列表、消息详情接口都在服务端校验会话。
- PostgreSQL 通过 `user_id` 隔离用户，通过 `conversation_id` 隔离会话，消息按自增 `id` 保持顺序。
- 模型最多加载当前会话最近 16 条消息，避免提示词无限增长。
- Chroma 返回候选 chunk 后按 `chunk_id` 去重，默认选取最相关的 4 条作为 RAG 上下文。
- 聊天接口按行发送检索状态、模型回答片段和最终结果；前端合并短时间内到达的片段，减少频繁重渲染。
- 新会话只有在模型回答完整生成后才会在一个数据库事务中写入会话、用户消息和助手消息，避免只写入一半。

## 常用检查

```powershell
npm run lint
npm run build
```

如果登录成功后出现“无法连接 PostgreSQL”，说明认证已经通过，但数据库服务尚未启动或 `DATABASE_URL` 不正确。

## LangChain 代码位置

- `lib/server/rag.ts`：项目自己的 LangChain.js 集成入口，负责提示词、历史消息、阿里云聊天模型、阿里云 Embedding 和 Chroma 检索。
- `app/api/chat/route.ts`：Next.js 聊天接口，读取登录用户和会话历史，然后调用 `streamAnswerWithRag` 并将事件流发给前端。
- `node_modules/@langchain/core`、`node_modules/@langchain/openai`：npm 安装的 LangChain 库源码，不应直接修改，也不会提交到 Git。

## 服务器部署

1. 在服务器安装 Node.js、PostgreSQL，并准备可持久化的 Chroma HTTP 服务。
2. 在服务器环境变量中设置 `.env.example` 列出的配置；正式 HTTPS 环境将 `SESSION_COOKIE_SECURE` 设置为 `true`。
3. 确保服务器能够通过 HTTPS 访问 `DASHSCOPE_BASE_URL`，并正确填写 PostgreSQL 和 Chroma 的服务器地址。
4. 首次部署执行 `npm install` 和 `npm run db:migrate`，然后执行 `npm run build`、`npm run start`。
5. 不要上传 `.env.local`，也不要把真实的百炼 API Key、数据库密码或 `SESSION_SECRET` 写入 Git。
