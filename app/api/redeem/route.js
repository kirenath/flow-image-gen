import { cookies } from "next/headers";
import { validateKey } from "@/lib/keys";
import { validateCode, redeemCode } from "@/lib/redeem";

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter: max 5 attempts per user per minute
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;

function checkRateLimit(key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * POST /api/redeem — Redeem a code for bonus quota
 * Body: { "code": "FLOW-XXXX-XXXX" }
 */
export async function POST(request) {
  // --- Auth Check ---
  const cookieStore = await cookies();
  const authKey = cookieStore.get("flow_auth")?.value;

  if (!authKey || !(await validateKey(authKey))) {
    return Response.json({ error: "未认证，请先登录" }, { status: 401 });
  }

  // --- Rate Limit ---
  if (!checkRateLimit(authKey)) {
    return Response.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429 },
    );
  }

  // --- Parse Body ---
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return Response.json({ error: "请提供兑换码" }, { status: 400 });
  }

  // --- Validate ---
  const check = await validateCode(code);
  if (!check.valid) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  // --- Redeem ---
  const result = await redeemCode(code, authKey);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    success: true,
    amount: result.amount,
    message: `成功兑换 ${result.amount} 次额度`,
  });
}
