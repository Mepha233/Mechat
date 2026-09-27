"use client";

import { useCallback, useEffect, useState } from "react";
import { Layout, Spin } from "antd";

import LoginModal from "./components/loginModal";
import ChatPanel from "./components/chatPanel";
import TalkList from "./components/talkList";
import type {
  AuthUser,
  ChatGenerationStatus,
  ChatMessage,
  ChatStreamEvent,
  ConversationSummary,
  RagSource,
} from "@/lib/types";
import styles from "./page.module.css";

const { Sider } = Layout;

type ApiError = {
  error?: string;
};

async function responseJson<T>(response: Response) {
  return (await response.json()) as T & ApiError;
}

export default function Home() {
  const [collapsed, setCollapsed] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [generationStatus, setGenerationStatus] =
    useState<ChatGenerationStatus | null>(null);
  const [pageError, setPageError] = useState("");

  const loadConversations = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      const data = await responseJson<{
        conversations?: ConversationSummary[];
      }>(response);

      if (!response.ok) {
        throw new Error(data.error ?? "历史会话加载失败。");
      }

      setConversations(data.conversations ?? []);
    } catch (reason) {
      setPageError(
        reason instanceof Error ? reason.message : "历史会话加载失败。",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = await responseJson<{ user?: AuthUser | null }>(response);

        if (!cancelled && data.user) {
          setUser(data.user);
          await loadConversations();
        }
      } catch {
        if (!cancelled) {
          setPageError("登录状态检查失败，请刷新页面重试。");
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [loadConversations]);

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPageError("");
    setMessageInput("");
    setGenerationStatus(null);
  };

  const handleLogin = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    startNewConversation();
    void loadConversations();
  };

  const selectConversation = async (conversationId: string) => {
    setMessagesLoading(true);
    setPageError("");
    setGenerationStatus(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        { cache: "no-store" },
      );
      const data = await responseJson<{ messages?: ChatMessage[] }>(response);

      if (!response.ok) {
        throw new Error(data.error ?? "历史消息加载失败。");
      }

      setActiveConversationId(conversationId);
      setMessages(data.messages ?? []);
    } catch (reason) {
      setPageError(
        reason instanceof Error ? reason.message : "历史消息加载失败。",
      );
    } finally {
      setMessagesLoading(false);
    }
  };

  const sendMessage = async () => {
    const content = messageInput.trim();

    if (!content || sending || !user) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      sources: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    setMessageInput("");
    setSending(true);
    setPageError("");
    setGenerationStatus({ phase: "searching" });

    const assistantId = `assistant-${Date.now()}`;
    let answer = "";
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    // 多个模型片段合并后更新一次消息，避免每个 token 都触发 React 重渲染。
    const showAnswer = (sources: RagSource[] = []) => {
      if (!answer) return;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: answer,
        sources,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => {
        const exists = current.some((item) => item.id === assistantId);
        return exists
          ? current.map((item) =>
              item.id === assistantId ? assistantMessage : item,
            )
          : [...current, assistantMessage];
      });
    };

    const scheduleAnswer = () => {
      if (renderTimer !== null) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        showAnswer();
      }, 50);
    };

    const handleEvent = (event: ChatStreamEvent) => {
      switch (event.type) {
        case "searching":
          setGenerationStatus({ phase: "searching" });
          break;
        case "retrieved":
          setGenerationStatus({ phase: "retrieved", count: event.count });
          break;
        case "delta":
          answer += event.text;
          setGenerationStatus((current) =>
            current?.phase === "answering"
              ? current
              : { phase: "answering", count: current?.count },
          );
          scheduleAnswer();
          break;
        case "saving":
          setGenerationStatus((current) => ({
            phase: "saving",
            count: current?.count,
          }));
          break;
        case "done":
          if (renderTimer !== null) clearTimeout(renderTimer);
          renderTimer = null;
          answer = event.answer;
          showAnswer(event.sources);
          setActiveConversationId(event.conversationId);
          setGenerationStatus((current) => ({
            phase: "completed",
            count: current?.count,
          }));
          completed = true;
          break;
        case "error":
          throw new Error(event.error);
      }
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: activeConversationId ?? undefined,
        }),
      });
      if (response.status === 401) {
        setUser(null);
        throw new Error("登录状态已失效，请重新登录。");
      }

      if (!response.ok) {
        const data = await responseJson<Record<string, unknown>>(response);
        throw new Error(data.error ?? "回答生成失败。");
      }

      if (!response.body) {
        throw new Error("服务器没有返回回答流。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const readLines = () => {
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handleEvent(JSON.parse(line) as ChatStreamEvent);
          newline = buffer.indexOf("\n");
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        readLines();
      }
      buffer += decoder.decode();
      readLines();
      if (buffer.trim()) handleEvent(JSON.parse(buffer) as ChatStreamEvent);
      if (!completed) throw new Error("回答流意外中断，请重试。");

      await loadConversations();
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "回答生成失败。");
    } finally {
      if (renderTimer !== null) clearTimeout(renderTimer);
      if (!completed) {
        showAnswer();
        setGenerationStatus(null);
      }
      setSending(false);
    }
  };

  const activeTitle = activeConversationId
    ? (conversations.find((item) => item.id === activeConversationId)?.title ??
      "历史对话")
    : "新对话";

  return (
    <>
      <Layout className={styles.pageLayout}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={272}
          collapsedWidth={76}
          className={styles.sidebar}
        >
          <TalkList
            collapsed={collapsed}
            username={user?.username}
            conversations={conversations}
            activeConversationId={activeConversationId}
            loading={historyLoading}
            onToggleCollapsed={() => {
              setCollapsed((current) => !current);
            }}
            onNewConversation={startNewConversation}
            onSelectConversation={(conversationId) => {
              void selectConversation(conversationId);
            }}
          />
        </Sider>

        <ChatPanel
          title={activeTitle}
          username={user?.username}
          messages={messages}
          messageInput={messageInput}
          error={pageError}
          messagesLoading={messagesLoading}
          sending={sending}
          generationStatus={generationStatus}
          onDismissError={() => setPageError("")}
          onMessageInputChange={setMessageInput}
          onSendMessage={() => {
            void sendMessage();
          }}
        />
      </Layout>

      <LoginModal open={authReady && !user} onLogin={handleLogin} />

      {!authReady ? (
        <div className={styles.authLoading}>
          <Spin size="large" description="正在检查登录状态" />
        </div>
      ) : null}
    </>
  );
}
