# Mechat

这是一个基于 Next.js App Router 的全栈 RAG 对话项目，可以在[这里](https://mepha.fun/posts/%E5%89%8D%E7%AB%AF%E9%A1%B9%E7%9B%AE%E8%AE%B0%E5%BD%95/)读取此项目的技术文档。



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


