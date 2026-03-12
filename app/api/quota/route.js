import { getQuotaInfo, validateKey } from "@/lib/keys";
import { cookies } from "next/headers";

/**
 * GET /api/quota — Return current user's quota info
 */
export async function GET() {
  const cookieStore = await cookies();
  const authKey = cookieStore.get("flow_auth")?.value;

  if (!authKey) {
    return Response.json({ error: "未认证" }, { status: 401 });
  }

  const info = await validateKey(authKey);
  if (!info) {
    return Response.json({ error: "密钥无效" }, { status: 401 });
  }

  const quota = await getQuotaInfo(authKey);
  return Response.json(quota);
}
