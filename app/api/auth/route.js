/**
 * POST /api/auth — (Legacy) Validate access key, set auth cookie
 * DELETE /api/auth — Logout, clear auth cookie
 */

export async function POST() {
  // Access Key login is no longer available
  return Response.json({ error: "请使用 Linux.do 登录" }, { status: 410 });
}

export async function DELETE() {
  const response = Response.json({ success: true });
  response.headers.set(
    "Set-Cookie",
    "flow_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  return response;
}
