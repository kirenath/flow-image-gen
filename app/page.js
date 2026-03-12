"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Smartphone,
  Square,
  Image as ImageIcon,
  Clipboard,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  Search,
  Download,
  ExternalLink,
  X,
  Camera,
  RefreshCcw,
  Gift,
  History,
  Ban,
  Palette,
  XCircle,
  Square as StopSquare,
  Copy,
} from "lucide-react";

// All supported aspect ratios
const ALL_ASPECTS = [
  {
    id: "landscape",
    label: "横屏 16:9",
    suffix: "landscape",
    icon: <Monitor size={16} />,
  },
  {
    id: "portrait",
    label: "竖屏 9:16",
    suffix: "portrait",
    icon: <Smartphone size={16} />,
  },
  {
    id: "square",
    label: "方图 1:1",
    suffix: "square",
    icon: <Square size={16} />,
  },
  {
    id: "four-three",
    label: "横屏 4:3",
    suffix: "four-three",
    icon: <ImageIcon size={16} />,
  },
  {
    id: "three-four",
    label: "竖屏 3:4",
    suffix: "three-four",
    icon: <Clipboard size={16} />,
  },
];

const ALL_RESOLUTIONS = [
  { id: "standard", label: "标准", suffix: "" },
  { id: "2k", label: "2K", suffix: "-2k" },
  { id: "4k", label: "4K", suffix: "-4k" },
];

// Model definitions
const MODELS = [
  {
    label: "Banana 2",
    prefix: "gemini-3.1-flash-image",
    badge: "Gemini 3.1 Flash",
    aspects: ["landscape", "portrait", "square", "four-three", "three-four"],
    resolutions: ["standard", "2k", "4k"],
  },
  {
    label: "Banana Pro",
    prefix: "gemini-3.0-pro-image",
    badge: "Gemini 3.0 Pro",
    aspects: ["landscape", "portrait", "square", "four-three", "three-four"],
    resolutions: ["standard", "2k", "4k"],
  },
  {
    label: "Imagen 4",
    prefix: "imagen-4.0-generate-preview",
    badge: "Imagen 4",
    aspects: ["landscape", "portrait"],
    resolutions: ["standard"],
  },
];

// Strip any known model prefix to show short label + aspect/res part
const MODEL_PREFIXES = MODELS.map((m) => ({
  prefix: m.prefix + "-",
  short: m.label,
}));
function formatModelDisplay(modelStr) {
  for (const { prefix, short } of MODEL_PREFIXES) {
    if (modelStr.startsWith(prefix))
      return `${short} · ${modelStr.slice(prefix.length)}`;
  }
  return modelStr;
}

function buildModelId(modelPrefix, aspectSuffix, resSuffix) {
  return `${modelPrefix}-${aspectSuffix}${resSuffix}`;
}

export default function Home() {
  const [selectedModel, setSelectedModel] = useState(0);
  const [selectedAspect, setSelectedAspect] = useState(0);
  const [selectedRes, setSelectedRes] = useState(0);

  // Derived: available aspects/resolutions for selected model
  const currentModel = MODELS[selectedModel];
  const availableAspects = ALL_ASPECTS.filter((a) =>
    currentModel.aspects.includes(a.id),
  );
  const availableRes = ALL_RESOLUTIONS.filter((r) =>
    currentModel.resolutions.includes(r.id),
  );
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [history, setHistory] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [error, setError] = useState(null);

  // Image-to-image state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);

  // Quota state
  const [quotaInfo, setQuotaInfo] = useState(null); // { role, name, used, total }

  // Redeem modal state
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState(null);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }

  // Past history (from server)
  const [showPastHistory, setShowPastHistory] = useState(false);
  const [pastHistory, setPastHistory] = useState([]);
  const [pastHistoryTotal, setPastHistoryTotal] = useState(0);
  const [pastHistoryLoading, setPastHistoryLoading] = useState(false);
  const historyLoadedRef = useRef(false);

  const fileInputRef = useRef(null);
  const galleryRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const router = useRouter();

  // Fetch quota on mount
  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota");
      if (res.ok) {
        const data = await res.json();
        setQuotaInfo(data);
      }
    } catch {}
  }, []);

  // Fetch past generation history from server
  const fetchPastHistory = useCallback(async (offset = 0, append = false) => {
    setPastHistoryLoading(true);
    try {
      const res = await fetch(`/api/history?limit=20&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setPastHistory((prev) => [...prev, ...data.items]);
        } else {
          setPastHistory(data.items);
        }
        setPastHistoryTotal(data.total);
        historyLoadedRef.current = true;
      }
    } catch {}
    setPastHistoryLoading(false);
  }, []);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  const handleTogglePastHistory = () => {
    const next = !showPastHistory;
    setShowPastHistory(next);
    if (next && !historyLoadedRef.current) {
      fetchPastHistory(0, false);
    }
  };

  const isQuotaExhausted =
    quotaInfo &&
    quotaInfo.role === "user" &&
    quotaInfo.totalAvailable !== null &&
    quotaInfo.totalAvailable <= 0;

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };

  // Redeem code handler
  const handleRedeem = async () => {
    if (!redeemInput.trim() || redeemLoading) return;
    setRedeemLoading(true);
    setRedeemError(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedeemError(data.error || "兑换失败");
        return;
      }
      // Success
      setShowRedeemModal(false);
      setRedeemInput("");
      setRedeemError(null);
      setToast({ type: "success", message: data.message });
      fetchQuota();
      setTimeout(() => setToast(null), 3000);
    } catch {
      setRedeemError("网络错误，请重试");
    } finally {
      setRedeemLoading(false);
    }
  };

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
    if (!prompt.trim() || generating || isQuotaExhausted) return;

    const model = MODELS[selectedModel];
    const aspect = availableAspects[selectedAspect] || availableAspects[0];
    const res = availableRes[selectedRes] || availableRes[0];
    const modelId = buildModelId(model.prefix, aspect.suffix, res.suffix);
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
        setStatusText("正在上传图片到 R2...\n");
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

          setStatusText("图片已上传到 R2\n");
          imageForApi = publicUrl;
        } catch (uploadErr) {
          throw new Error(`图片上传失败: ${uploadErr.message}`);
        }
      }

      const body = { model: modelId, prompt: currentPrompt };
      if (imageForApi) {
        body.image = imageForApi;
      }

      setStatusText((prev) => prev + "图片生成任务已启动\n");

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

        // 重新从服务器拉取历史记录第一页，确保数据一致
        fetchPastHistory(0, false);

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
      fetchQuota(); // Refresh quota after generation
    }
  }, [
    prompt,
    generating,
    selectedModel,
    selectedAspect,
    selectedRes,
    availableAspects,
    availableRes,
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
          <span className="badge">{currentModel.badge}</span>
        </div>
        <div className="header-right">
          {quotaInfo && (
            <div className="quota-display">
              <span className="quota-name">{quotaInfo.name}</span>
              {quotaInfo.role === "admin" ? (
                <span className="quota-badge">∞ 无限</span>
              ) : (
                <>
                  <span className="quota-badge quota-detail" title="每日额度">
                    今日 {quotaInfo.dailyTotal - quotaInfo.dailyUsed}/
                    {quotaInfo.dailyTotal}
                  </span>
                  <span className="quota-badge quota-detail" title="初始额度">
                    初始 {quotaInfo.initialTotal - quotaInfo.initialUsed}/
                    {quotaInfo.initialTotal}
                  </span>
                  {quotaInfo.bonusTotal > 0 && (
                    <span
                      className="quota-badge quota-detail"
                      title="兑换码额度"
                    >
                      额外 {quotaInfo.bonusTotal - quotaInfo.bonusUsed}/
                      {quotaInfo.bonusTotal}
                    </span>
                  )}
                  <span className="quota-badge quota-total" title="总可用次数">
                    可用 {quotaInfo.totalAvailable}
                  </span>
                </>
              )}
            </div>
          )}
          {quotaInfo && quotaInfo.role !== "admin" && (
            <button
              className="redeem-btn"
              onClick={() => {
                setShowRedeemModal(true);
                setRedeemError(null);
                setRedeemInput("");
              }}
              title="兑换额度"
            >
              <Gift size={16} className="inline mr-1" /> 兑换
            </button>
          )}
          <button
            className="btn-logout"
            onClick={handleLogout}
            title="退出登录"
          >
            退出
          </button>
        </div>
      </header>

      {/* Gallery */}
      <main className="main">
        <div
          className={`gallery ${history.length > 1 ? "multi-images" : ""}`}
          ref={galleryRef}
        >
          {history.length === 0 && !generating && !error && (
            <div className="empty-state">
              <div className="icon">
                <Palette size={48} opacity={0.3} />
              </div>
              <p>输入描述生成图片，或上传图片进行图生图</p>
            </div>
          )}

          {history.map((item) => (
            <div className="history-item" key={item.id}>
              <div className="history-item-header">
                <span className="history-item-prompt">
                  {item.sourceImage && (
                    <ImageIcon
                      size={14}
                      className="inline"
                      style={{ marginRight: "4px" }}
                    />
                  )}
                  {item.prompt}
                </span>
                <span className="history-item-meta">
                  <span className="history-item-model">
                    {formatModelDisplay(item.model)}
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
                  onClick={() => {
                    navigator.clipboard.writeText(item.prompt);
                    setToast({ type: "success", message: "提示词已复制" });
                    setTimeout(() => setToast(null), 2000);
                  }}
                >
                  <Copy
                    size={14}
                    className="inline"
                    style={{ marginRight: "4px" }}
                  />{" "}
                  复制提示词
                </button>
                <button
                  className="btn-icon"
                  onClick={() => setLightboxUrl(item.imageUrl)}
                >
                  <Search
                    size={14}
                    className="inline"
                    style={{ marginRight: "4px" }}
                  />{" "}
                  放大
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDownload(item.imageUrl, item.prompt)}
                >
                  <Download
                    size={14}
                    className="inline"
                    style={{ marginRight: "4px" }}
                  />{" "}
                  下载
                </button>
                <button
                  className="btn-icon"
                  onClick={() => window.open(item.imageUrl, "_blank")}
                >
                  <ExternalLink
                    size={14}
                    className="inline"
                    style={{ marginRight: "4px" }}
                  />{" "}
                  新窗口
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

          {error && !generating && (
            <div className="error-text">
              <Ban size={16} className="inline mr-2" /> {error}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="controls">
          {/* Row 0: Model */}
          <div className="controls-row">
            <span className="controls-label">模型</span>
            <div className="aspect-pills">
              {MODELS.map((m, i) => (
                <button
                  key={m.prefix}
                  className={`aspect-pill ${i === selectedModel ? "active" : ""}`}
                  onClick={() => {
                    setSelectedModel(i);
                    // Reset aspect/res if current selection is out of range
                    const newAspects = ALL_ASPECTS.filter((a) =>
                      MODELS[i].aspects.includes(a.id),
                    );
                    const newRes = ALL_RESOLUTIONS.filter((r) =>
                      MODELS[i].resolutions.includes(r.id),
                    );
                    if (selectedAspect >= newAspects.length)
                      setSelectedAspect(0);
                    if (selectedRes >= newRes.length) setSelectedRes(0);
                  }}
                  disabled={generating}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 1: Aspect Ratio */}
          <div className="controls-row">
            <span className="controls-label">比例</span>
            <div className="aspect-pills">
              {availableAspects.map((a, i) => (
                <button
                  key={a.id}
                  className={`aspect-pill ${i === selectedAspect ? "active" : ""}`}
                  onClick={() => setSelectedAspect(i)}
                  disabled={generating}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Resolution (hide if only 1 option) */}
          {availableRes.length > 1 && (
            <div className="controls-row">
              <span className="controls-label">分辨率</span>
              <div className="aspect-pills">
                {availableRes.map((r, i) => (
                  <button
                    key={r.id}
                    className={`aspect-pill ${i === selectedRes ? "active" : ""}`}
                    onClick={() => setSelectedRes(i)}
                    disabled={generating}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded image preview */}
          {uploadedPreview && (
            <div className="upload-preview">
              <img src={uploadedPreview} alt="上传的图片" />
              <div className="upload-preview-info">
                <span>
                  <Camera size={14} className="inline mr-1" /> 图生图模式
                </span>
                <button className="upload-remove" onClick={clearImage}>
                  <X size={14} className="inline mr-1" /> 移除
                </button>
              </div>
            </div>
          )}

          {/* Row 3: Prompt + buttons */}
          <div className="prompt-row">
            <button
              className="history-toggle-btn"
              onClick={handleTogglePastHistory}
              title={showPastHistory ? "返回生成" : "历史记录"}
            >
              {showPastHistory ? (
                <RefreshCcw size={16} />
              ) : (
                <History size={16} />
              )}
              <span className="btn-label">
                {showPastHistory ? "返回" : "历史"}
              </span>
              {pastHistoryTotal > 0 && !showPastHistory && (
                <span className="past-history-count">{pastHistoryTotal}</span>
              )}
            </button>

            <button
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={generating}
              title="上传本地图片"
            >
              <UploadCloud size={16} />{" "}
              <span className="btn-label">上传图片</span>
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
                <XCircle size={16} className="inline mr-1" /> 取消
              </button>
            ) : (
              <button
                className="generate-btn"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isQuotaExhausted}
              >
                {isQuotaExhausted ? (
                  "额度用完"
                ) : (
                  <>
                    <Sparkles size={16} />{" "}
                    <span className="btn-label">生成</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Past History Panel */}
        <div
          className={`past-history-section ${showPastHistory ? "open" : ""}`}
        >
          {showPastHistory && (
            <div className="past-history-grid">
              {pastHistory.length === 0 && !pastHistoryLoading && (
                <div className="empty-state">
                  <div className="icon">
                    <History size={48} opacity={0.3} />
                  </div>
                  <p>还没有历史记录</p>
                </div>
              )}
              {pastHistory.map((item) => (
                <div className="past-history-card" key={item.id}>
                  {item.image_url && item.image_url !== "[base64-inline]" ? (
                    <img
                      src={item.image_url}
                      alt={item.prompt}
                      className="past-history-thumb"
                      onClick={() => setLightboxUrl(item.image_url)}
                      loading="lazy"
                    />
                  ) : (
                    <div className="past-history-thumb-placeholder">
                      <ImageIcon size={24} opacity={0.5} />
                    </div>
                  )}
                  <div className="past-history-info">
                    <span className="past-history-prompt">
                      {item.has_input_image && (
                        <ImageIcon size={14} className="inline mr-1" />
                      )}
                      {item.prompt?.slice(0, 60) || "无提示词"}
                    </span>
                    <span className="past-history-meta">
                      {formatModelDisplay(item.model || "")}
                      {" · "}
                      {new Date(item.created_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {item.image_url && item.image_url !== "[base64-inline]" && (
                    <div className="past-history-actions">
                      <button
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.prompt || "");
                          setToast({
                            type: "success",
                            message: "提示词已复制",
                          });
                          setTimeout(() => setToast(null), 2000);
                        }}
                        title="复制提示词"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() =>
                          handleDownload(item.image_url, item.prompt || "image")
                        }
                        title="下载"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {pastHistory.length < pastHistoryTotal && (
                <button
                  className="past-history-loadmore"
                  onClick={() => fetchPastHistory(pastHistory.length, true)}
                  disabled={pastHistoryLoading}
                >
                  {pastHistoryLoading ? "加载中..." : "加载更多"}
                </button>
              )}
              {pastHistoryLoading && pastHistory.length === 0 && (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Redeem Modal */}
      {showRedeemModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowRedeemModal(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              <Gift size={20} className="inline mr-2" /> 兑换额度
            </h2>
            <p className="modal-desc">
              输入管理员提供的兑换码，获得额外生图次数
            </p>
            <input
              className="modal-input"
              type="text"
              placeholder="输入兑换码，如 FLOW-XXXX-XXXX"
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
              disabled={redeemLoading}
              autoFocus
            />
            {redeemError && <div className="modal-error">{redeemError}</div>}
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() => setShowRedeemModal(false)}
                disabled={redeemLoading}
              >
                取消
              </button>
              <button
                className="modal-btn modal-btn-confirm"
                onClick={handleRedeem}
                disabled={!redeemInput.trim() || redeemLoading}
              >
                {redeemLoading ? "兑换中..." : "确认兑换"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "success" ? (
            <CheckCircle2 size={16} className="inline" />
          ) : (
            <XCircle size={16} className="inline" />
          )}{" "}
          {toast.message}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button
            className="lightbox-close"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={24} />
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
