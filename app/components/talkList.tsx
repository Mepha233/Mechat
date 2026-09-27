"use client";

import { useRef, useState } from "react";
import {
  HistoryOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import type { InputRef } from "antd";
import {
  Avatar,
  Button,
  Empty,
  Input,
  Menu,
  Modal,
  Popover,
  Tooltip,
} from "antd";

import type { ConversationSummary } from "@/lib/types";
import styles from "./talkList.module.css";

type MenuItem = Required<MenuProps>["items"][number];

interface TalkListProps {
  collapsed: boolean;
  username?: string;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  onToggleCollapsed: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export default function TalkList({
  collapsed,
  username,
  conversations,
  activeConversationId,
  loading,
  onToggleCollapsed,
  onNewConversation,
  onSelectConversation,
}: TalkListProps) {
  const searchInputRef = useRef<InputRef>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const historyContent = conversations.length ? (
    <div className={styles.historyList}>
      {conversations.map((conversation) => (
        <Button
          block
          className={styles.historyItem}
          data-active={conversation.id === activeConversationId}
          key={conversation.id}
          type="text"
          onClick={() => onSelectConversation(conversation.id)}
        >
          {conversation.title}
        </Button>
      ))}
    </div>
  ) : (
    <Empty
      className={styles.emptyHistory}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={loading ? "正在加载" : "暂无历史会话"}
    />
  );

  const items: MenuItem[] = [
    {
      key: "new",
      label: "新建对话",
      icon: <MailOutlined />,
    },
    { type: "divider" },
    {
      key: "history",
      label: "最近",
      type: "group",
      children: conversations.length
        ? conversations.map((conversation) => ({
            key: conversation.id,
            label: conversation.title,
            icon: <HistoryOutlined />,
          }))
        : [
            {
              key: "empty",
              label: loading ? "正在加载…" : "暂无历史会话",
              disabled: true,
            },
          ],
    },
  ];

  return (
    <>
      <div className={styles.talkListRoot} data-collapsed={collapsed}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>{collapsed ? "M" : "Mechat"}</div>

          <div className={styles.sidebarActions}>
            <Tooltip
              title="搜索会话"
              placement={collapsed ? "right" : "bottom"}
              align={{ offset: collapsed ? [25, 0] : [0, 10] }}
              mouseEnterDelay={0.25}
            >
              <Button
                aria-label="搜索会话"
                className={styles.iconButton}
                icon={<SearchOutlined />}
                onClick={() => setIsModalOpen(true)}
              />
            </Tooltip>

            <Tooltip
              title={collapsed ? "展开侧栏" : "收起侧栏"}
              placement={collapsed ? "right" : "bottom"}
              align={{ offset: collapsed ? [25, 0] : [0, 10] }}
              mouseEnterDelay={0.25}
            >
              <Button
                aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
                className={styles.iconButton}
                icon={
                  collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
                }
                onClick={onToggleCollapsed}
              />
            </Tooltip>
          </div>
        </div>

        <div className={styles.talkListArea}>
          {collapsed ? (
            <div className={styles.collapsedList}>
              <Tooltip
                title="新建对话"
                placement="right"
                align={{ offset: [25, 0] }}
                mouseEnterDelay={0.25}
              >
                <Button
                  aria-label="新建对话"
                  className={styles.collapsedActionButton}
                  icon={<MailOutlined />}
                  shape="circle"
                  onClick={onNewConversation}
                />
              </Tooltip>

              <Popover
                title="历史对话"
                content={historyContent}
                placement="rightTop"
                trigger="click"
              >
                <Tooltip
                  title="历史对话"
                  placement="right"
                  align={{ offset: [25, 0] }}
                  mouseEnterDelay={0.25}
                >
                  <Button
                    aria-label="历史对话"
                    className={styles.collapsedActionButton}
                    icon={<HistoryOutlined />}
                    shape="circle"
                  />
                </Tooltip>
              </Popover>
            </div>
          ) : (
            <Menu
              className={styles.menu}
              mode="inline"
              items={items}
              selectedKeys={activeConversationId ? [activeConversationId] : []}
              onClick={({ key }) => {
                if (key === "new") {
                  onNewConversation();
                } else if (key !== "empty") {
                  onSelectConversation(key);
                }
              }}
            />
          )}
        </div>

        {username ? (
          <div className={styles.userPanel} title={username}>
            <Avatar className={styles.userAvatar}>
              {username.charAt(0).toUpperCase()}
            </Avatar>
            <span className={styles.userName}>{username}</span>
          </div>
        ) : null}
      </div>

      <Modal
        title="会话查询"
        open={isModalOpen}
        onOk={() => setIsModalOpen(false)}
        onCancel={() => setIsModalOpen(false)}
        afterOpenChange={(open) => {
          if (open) {
            window.setTimeout(() => searchInputRef.current?.focus(), 0);
          }
        }}
      >
        <Input ref={searchInputRef} placeholder="输入会话名称或关键词" />
      </Modal>
    </>
  );
}
