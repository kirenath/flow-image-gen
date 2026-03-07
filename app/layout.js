import "./globals.css";

export const metadata = {
  title: "Flow Image Gen",
  description: "通过 Flow2API 生成 AI 图片",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
