"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Gemini 3.1 Flash only — aspect ratios
const ASPECTS = [
  { label: "横屏 16:9", suffix: "landscape", icon: "🖥️" },
  { label: "竖屏 9:16", suffix: "portrait", icon: "📱" },
  { label: "方图 1:1", suffix: "square", icon: "⬜" },
  { label: "横屏 4:3", suffix: "four-three", icon: "🖼️" },
  { label: "竖屏 3:4", suffix: "three-four", icon: "📋" },
];

const RESOLUTIONS = [
  { label: "标准", suffix: "" },
  { label: "2K", suffix: "-2k" },
  { label: "4K", suffix: "-4k" },
];

function buildModelId(aspectSuffix, resSuffix) {
  return `gemini-3.1-flash-image-${aspectSuffix}${resSuffix}`;
}

export default function Home() {
  const [selectedAspect, setSelectedAspect] = useState(0);
  const [selectedRes, setSelectedRes] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [history, setHistory] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [error, setError] = useState(null);

  // Image-to-image state
  const [uploadedImage, setUploadedImage] = useState(null); // base64 data URL or public URL
  const [uploadedPreview, setUploadedPreview] = useState(null); // preview URL

  const fileInputRef = useRef(null);

  const galleryRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  // Scroll to bottom on new history item
  useEffect(() => {
    if (galleryRef.current) {
      galleryRef.current.scrollTop = galleryRef.current.scrollHeight;
    }
  }, [history, generating]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小不能超过 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImage(ev.target.result); // data:image/xxx;base64,...
      setUploadedPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setUploadedImage(null);
    setUploadedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;

    const aspect = ASPECTS[selectedAspect];
    const res = RESOLUTIONS[selectedRes];
    const modelId = buildModelId(aspect.suffix, res.suffix);
    const currentPrompt = prompt.trim();
    const currentImage = uploadedImage;

    setGenerating(true);
    setStatusText("");
    setError(null);
    setPrompt("");

    try {
      abortRef.current = new AbortController();

      // Upload image to R2 first
      let imageForApi = null;
      if (currentImage) {
        setStatusText("📤 正在上传图片到 R2...\n");
        try {
          // 1. Get presigned URL from our API
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: `upload.${currentImage.match(/data:image\/(\w+)/)?.[1] || "png"}`,
              filetype:
                currentImage.match(/data:(image\/\w+)/)?.[1] || "image/png",
            }),
          });
          if (!uploadRes.ok) throw new Error("获取上传链接失败");
          const { url: signedUrl, publicUrl } = await uploadRes.json();

          // 2. Convert base64 to blob and upload to R2
          const base64Data = currentImage.split(",")[1];
          const binaryData = atob(base64Data);
          const bytes = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
          }
          const blob = new Blob([bytes], {
            type: currentImage.match(/data:(image\/\w+)/)?.[1] || "image/png",
          });

          const putRes = await fetch(signedUrl, {
            method: "PUT",
            body: blob,
            headers: { "Content-Type": blob.type },
          });
          if (!putRes.ok) throw new Error("上传图片到 R2 失败");

          setStatusText("✅ 图片已上传到 R2\n");
          imageForApi = publicUrl;
        } catch (uploadErr) {
          throw new Error(`图片上传失败: ${uploadErr.message}`);
        }
      }

      const body = { model: modelId, prompt: currentPrompt };
      if (imageForApi) {
        body.image = imageForApi;
      }

      setStatusText((prev) => prev + "✨ 图片生成任务已启动\n");

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `请求失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let imageUrl = null;
      let allContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              throw new Error(
                parsed.error.message || JSON.stringify(parsed.error),
              );
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta || {};

            if (delta.reasoning_content) {
              setStatusText((prev) => prev + delta.reasoning_content);
            }

            if (delta.content) {
              allContent += delta.content;
              const match = delta.content.match(/!\[.*?\]\((.*?)\)/);
              if (match) imageUrl = match[1];
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes("JSON")) {
              throw parseErr;
            }
          }
        }
      }

      if (!imageUrl && allContent) {
        const match = allContent.match(/!\[.*?\]\((.*?)\)/);
        if (match) imageUrl = match[1];
      }

      if (imageUrl) {
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now(),
            prompt: currentPrompt,
            model: modelId,
            imageUrl,
            sourceImage: currentImage ? uploadedPreview : null,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        clearImage();
      } else {
        const debugInfo = allContent
          ? `\n返回内容: ${allContent.slice(0, 200)}`
          : "";
        setError(`未能解析到图片${debugInfo}`);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setGenerating(false);
      setStatusText("");
      abortRef.current = null;
    }
  }, [
    prompt,
    generating,
    selectedAspect,
    selectedRes,
    uploadedImage,
    uploadedPreview,
  ]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDownload = async (url, promptText) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flow-${promptText.slice(0, 20).replace(/[^\w\u4e00-\u9fff]/g, "_")}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  // Handle paste image or URL
  const handlePaste = (e) => {
    // Check for pasted image files
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => {
            setUploadedImage(ev.target.result);
            setUploadedPreview(ev.target.result);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <h1>Flow Image Gen</h1>
          <span className="badge">Gemini 3.1 Flash</span>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span>已连接</span>
        </div>
      </header>

      {/* Gallery */}
      <main className="main">
        <div className="gallery" ref={galleryRef}>
          {history.length === 0 && !generating && !error && (
            <div className="empty-state">
              <div className="icon">🎨</div>
              <p>输入描述生成图片，或上传图片进行图生图</p>
            </div>
          )}

          {history.map((item) => (
            <div className="history-item" key={item.id}>
              <div className="history-item-header">
                <span className="history-item-prompt">
                  {item.sourceImage && "🖼️ "}
                  {item.prompt}
                </span>
                <span className="history-item-meta">
                  <span className="history-item-model">
                    {item.model.replace("gemini-3.1-flash-image-", "")}
                  </span>
                </span>
              </div>
              <div className="history-item-body">
                {item.sourceImage && (
                  <div className="source-image-badge">
                    <img src={item.sourceImage} alt="参考图" />
                    <span>参考图</span>
                  </div>
                )}
                <img
                  src={item.imageUrl}
                  alt={item.prompt}
                  onClick={() => setLightboxUrl(item.imageUrl)}
                  loading="lazy"
                />
              </div>
              <div className="history-item-actions">
                <button
                  className="btn-icon"
                  onClick={() => setLightboxUrl(item.imageUrl)}
                >
                  🔍 放大
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDownload(item.imageUrl, item.prompt)}
                >
                  💾 下载
                </button>
                <button
                  className="btn-icon"
                  onClick={() => window.open(item.imageUrl, "_blank")}
                >
                  🔗 新窗口
                </button>
              </div>
            </div>
          ))}

          {generating && (
            <div className="history-item">
              <div className="history-item-body">
                <div className="loading-container">
                  <div className="loading-spinner" />
                  <div className="loading-text">{statusText}</div>
                </div>
              </div>
            </div>
          )}

          {error && !generating && <div className="error-text">❌ {error}</div>}
        </div>

        {/* Controls */}
        <div className="controls">
          {/* Row 1: Aspect Ratio */}
          <div className="controls-row">
            <span className="controls-label">比例</span>
            <div className="aspect-pills">
              {ASPECTS.map((a, i) => (
                <button
                  key={a.suffix}
                  className={`aspect-pill ${i === selectedAspect ? "active" : ""}`}
                  onClick={() => setSelectedAspect(i)}
                  disabled={generating}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Resolution */}
          <div className="controls-row">
            <span className="controls-label">分辨率</span>
            <div className="aspect-pills">
              {RESOLUTIONS.map((r, i) => (
                <button
                  key={r.label}
                  className={`aspect-pill ${i === selectedRes ? "active" : ""}`}
                  onClick={() => setSelectedRes(i)}
                  disabled={generating}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Uploaded image preview */}
          {uploadedPreview && (
            <div className="upload-preview">
              <img src={uploadedPreview} alt="上传的图片" />
              <div className="upload-preview-info">
                <span>📷 图生图模式</span>
                <button className="upload-remove" onClick={clearImage}>
                  ✕ 移除
                </button>
              </div>
            </div>
          )}

          {/* Row 3: Prompt + buttons */}
          <div className="prompt-row">
            <button
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={generating}
              title="上传本地图片"
            >
              📷 上传图片
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            <div className="prompt-input-wrapper">
              <textarea
                ref={textareaRef}
                className="prompt-input"
                placeholder={
                  uploadedImage
                    ? "描述你想要的变换效果... (Enter 发送)"
                    : "描述你想生成的图片... (Enter 发送, Shift+Enter 换行, 可粘贴图片)"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={generating}
                rows={1}
              />
            </div>
            {generating ? (
              <button className="generate-btn cancel" onClick={handleCancel}>
                ⏹ 取消
              </button>
            ) : (
              <button
                className="generate-btn"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
              >
                ✨ 生成
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button
            className="lightbox-close"
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Full size preview"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
