"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = () => {
    window.location.href = "/api/auth/linuxdo";
  };

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
