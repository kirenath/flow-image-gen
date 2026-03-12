import { cookies } from "next/headers";
import { validateKey } from "@/lib/keys";
import supabase from "@/lib/supabase";

/**
 * GET /api/history — Return current user's generation history
 * Query params: limit (default 20), offset (default 0)
 */
export async function GET(request) {
  const cookieStore = await cookies();
  const authKey = cookieStore.get("flow_auth")?.value;

  if (!authKey || !(await validateKey(authKey))) {
    return Response.json({ error: "未认证" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const { data, error, count } = await supabase
    .from("generations")
    .select("*", { count: "exact" })
    .eq("user_key", authKey)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[History] Failed to fetch:", error.message);
    return Response.json({ error: "获取历史记录失败" }, { status: 500 });
  }

  return Response.json({
    items: data || [],
    total: count || 0,
    limit,
    offset,
  });
}
