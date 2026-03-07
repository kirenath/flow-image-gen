import { validateKey, getQuotaInfo } from "@/lib/keys";

/**
 * POST /api/auth — Validate access key, set auth cookie
 * DELETE /api/auth — Logout, clear auth cookie
 */

export async function POST(request) {
  try {
    const { key } = await request.json();

    if (!key || typeof key !== "string") {
      return Response.json({ error: "请输入访问密钥" }, { status: 400 });
    }

    const info = validateKey(key.trim());
    if (!info) {
      return Response.json({ error: "密钥无效" }, { status: 401 });
    }

    // Check quota for user keys
    const quotaInfo = getQuotaInfo(key.trim());
    if (
      quotaInfo &&
      quotaInfo.role === "user" &&
      quotaInfo.used >= quotaInfo.total
    ) {
      return Response.json(
        { error: `额度已用完 (${quotaInfo.used}/${quotaInfo.total})` },
        { status: 403 },
      );
    }

    // Set HttpOnly cookie with the key (valid 7 days)
    const response = Response.json({
      success: true,
      role: info.role,
      name: info.name,
    });

    response.headers.set(
      "Set-Cookie",
      `flow_auth=${key.trim()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    );

    return response;
  } catch (e) {
    return Response.json({ error: "请求解析失败" }, { status: 400 });
  }
}

export async function DELETE() {
  const response = Response.json({ success: true });
  response.headers.set(
    "Set-Cookie",
    "flow_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  return response;
}
