/**
 * Server-side API proxy for Flow2API
 * Supports text-to-image and image-to-image
 * Hides API key from the browser, streams SSE responses
 */

import { cookies } from "next/headers";
import {
  validateKey,
  hasQuota,
  incrementUsage,
  getQuotaInfo,
} from "@/lib/keys";

// Allow large request bodies (base64 images can be several MB)
export const maxDuration = 300;

export async function POST(request) {
  // --- Auth & Quota Check ---
  const cookieStore = await cookies();
  const authKey = cookieStore.get("flow_auth")?.value;

  if (!authKey || !validateKey(authKey)) {
    return Response.json({ error: "未认证，请先登录" }, { status: 401 });
  }

  if (!hasQuota(authKey)) {
    const qi = getQuotaInfo(authKey);
    return Response.json(
      { error: `额度已用完 (${qi?.used}/${qi?.total})，无法继续生成` },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json(
      { error: "请求体解析失败，图片可能过大" },
      { status: 400 },
    );
  }

  const { model, prompt, image } = body;

  const apiUrl = process.env.FLOW_API_URL;
  const apiKey = process.env.FLOW_API_KEY;

  if (!apiUrl || !apiKey) {
    return Response.json(
      { error: "请在 .env.local 中配置 FLOW_API_URL 和 FLOW_API_KEY" },
      { status: 500 },
    );
  }

  // Build messages based on whether we have an image (img2img) or not (txt2img)
  let content;
  if (image) {
    // Image-to-image: multimodal content array
    content = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: image } },
    ];
  } else {
    // Text-to-image: simple string
    content = prompt;
  }

  const requestBody = {
    model,
    messages: [{ role: "user", content }],
    stream: true,
  };

  console.log(
    `[Flow2API] Request [User: ${authKey}]: model=${model}, hasImage=${!!image}, prompt="${prompt.slice(0, 50)}..."`,
  );

  try {
    const response = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[Flow2API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Flow2API] Error: ${errorText}`);
      return Response.json(
        { error: `API 请求失败 (${response.status}): ${errorText}` },
        { status: response.status },
      );
    }

    // Stream the SSE response back to the client
    // Increment usage BEFORE streaming (generation was accepted by Flow2API)
    incrementUsage(authKey);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body.getReader();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (e) {
        console.error("[Flow2API] Stream error:", e);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Flow2API] Fetch error:", error);
    return Response.json(
      { error: `请求异常: ${error.message}` },
      { status: 500 },
    );
  }
}
