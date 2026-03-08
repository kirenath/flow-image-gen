"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = () => {
    window.location.href = "/api/auth/linuxdo";
  };

  const handleDevLogin = async () => {
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json();
        alert(data.error || "开发登录失败");
      }
    } catch (e) {
      alert("网络错误");
    }
  };

  const isDevBypass =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_LOCAL_DEV_BYPASS === "true";

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🎨</div>
          <h1>Flow Image Gen</h1>
          <p>使用 Linux.do 账号登录以继续</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="button" className="login-oauth-btn" onClick={handleLogin}>
          🐧 使用 Linux.do 登录
        </button>

        {isDevBypass && (
          <button
            type="button"
            className="login-oauth-btn"
            style={{
              marginTop: "12px",
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            }}
            onClick={handleDevLogin}
          >
            🚧 [Dev] 模拟管理员登录
          </button>
        )}

        <div className="login-footer">
          <p>需要 Trust Level 2+ 才能使用</p>
          <p>Powered by Flow2API · Gemini 3.1 Flash</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <div className="login-header">
              <div className="login-icon">🎨</div>
              <h1>Flow Image Gen</h1>
            </div>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
