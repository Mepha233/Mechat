"use client";

import {
  Alert,
  Button,
  Input,
  Layout,
  Space,
  Spin,
  Typography,
} from "antd";

import type { ChatGenerationStatus, ChatMessage } from "@/lib/types";
import styles from "./chatPanel.module.css";

const { Header, Footer, Content } = Layout;

interface ChatPanelProps {
  title: string;
  username?: string;
  messages: ChatMessage[];
  messageInput: string;
  error: string;
  messagesLoading: boolean;
  sending: boolean;
  generationStatus: ChatGenerationStatus | null;
  onDismissError: () => void;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
}

export default function ChatPanel({
  title,
  username,
  messages,
  messageInput,
  error,
  messagesLoading,
  sending,
  generationStatus,
  onDismissError,
  onMessageInputChange,
  onSendMessage,
}: ChatPanelProps) {
  return (
    <Layout className={styles.chatLayout}>
      <Header className={styles.header}>{title}</Header>

      <Content className={styles.content}>
        <div className={styles.messageColumn}>
          {error ? (
            <Alert
              className={styles.pageAlert}
              type="error"
              message={error}
              showIcon
              closable
              onClose={onDismissError}
            />
          ) : null}

          {messagesLoading ? (
            <div className={styles.centerState}>
              <Spin description="正在加载历史消息" />
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.emptyState}>
              <Typography.Title level={2}>你好，我是 Mechat</Typography.Title>
              <Typography.Paragraph>
                新建一个对话，或者从左侧选择历史会话。
              </Typography.Paragraph>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((message) => (
                <article
                  className={styles.messageRow}
                  data-role={message.role}
                  key={message.id}
                >
                  <div className={styles.messageBubble}>
                    <div className={styles.messageRole}>
                      {message.role === "user" ? username : "Mechat"}
                    </div>
                    <div className={styles.messageContent}>{message.content}</div>
                    {message.sources.length ? (
                      <details className={styles.sources}>
                        <summary>参考资料 {message.sources.length} 条</summary>
                        <ol>
                          {message.sources.map((source) => (
                            <li key={source.chunkId}>
                              {source.section || source.chunkId}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                </article>
              ))}

              {generationStatus ? (
                <div className={styles.generatingState} role="status" aria-live="polite">
                  {sending ? <Spin size="small" /> : null}
                  {generationStatus.phase === "searching"
                    ? "正在查询相关资料…"
                    : (
                      <span>
                        {generationStatus.count
                          ? `已完成资料查找，找到 ${generationStatus.count} 条相关资料。`
                          : "已完成资料查找，未找到相关资料。"}
                        {" "}
                        {generationStatus.phase === "answering"
                          ? "正在生成回答…"
                          : generationStatus.phase === "saving"
                            ? "回答已生成，正在保存会话…"
                            : generationStatus.phase === "completed"
                              ? "回答完成。"
                              : "正在准备回答…"}
                      </span>
                    )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Content>

      <Footer className={styles.footer}>
        <Space.Compact className={styles.composer}>
          <Input
            className={styles.messageInput}
            placeholder="需要做点什么？"
            value={messageInput}
            disabled={!username || sending}
            onChange={(event) => onMessageInputChange(event.target.value)}
            onPressEnter={onSendMessage}
          />
          <Button
            type="primary"
            className={styles.sendButton}
            loading={sending}
            disabled={!username || !messageInput.trim()}
            onClick={onSendMessage}
          >
            发送
          </Button>
        </Space.Compact>
      </Footer>
    </Layout>
  );
}
