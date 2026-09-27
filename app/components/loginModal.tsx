"use client";

import { useRef, useState } from "react";
import { Alert, Button, Form, Input, Modal, Typography } from "antd";
import type { InputRef } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";

import type { AuthUser } from "@/lib/types";
import styles from "./loginModal.module.css";

type LoginValues = {
  username: string;
  password: string;
};

type LoginModalProps = {
  open: boolean;
  onLogin: (user: AuthUser) => void;
};

export default function LoginModal({ open, onLogin }: LoginModalProps) {
  const usernameRef = useRef<InputRef>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as {
        user?: AuthUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "登录失败。");
      }

      onLogin(data.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="登录 Mechat"
      open={open}
      footer={null}
      closable={false}
      keyboard={false}
      mask={{ closable: false }}
      centered
      width={420}
      afterOpenChange={(isOpen) => {
        if (isOpen) {
          window.setTimeout(() => usernameRef.current?.focus(), 0);
        }
      }}
    >
      <Typography.Paragraph className={styles.description}>
        当前是本地开发账号模式，登录后才能访问聊天和历史会话。
      </Typography.Paragraph>

      {error ? (
        <Alert className={styles.alert} type="error" message={error} showIcon />
      ) : null}

      <Form<LoginValues>
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="用户名"
          name="username"
          rules={[{ required: true, message: "请输入用户名。" }]}
        >
          <Input
            ref={usernameRef}
            prefix={<UserOutlined />}
            placeholder="用户名"
            autoComplete="username"
          />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: "请输入密码。" }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="密码"
            autoComplete="current-password"
          />
        </Form.Item>

        <Button
          className={styles.submitButton}
          type="primary"
          htmlType="submit"
          loading={submitting}
          block
        >
          登录
        </Button>
      </Form>
    </Modal>
  );
}
