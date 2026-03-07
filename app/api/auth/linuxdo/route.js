import { NextResponse } from "next/server";

/**
 * GET /api/auth/linuxdo — Redirect to Linux.do OAuth authorize page
 */
export async function GET() {
  const clientId = process.env.LINUXDO_CLIENT_ID;
  const redirectUri = process.env.LINUXDO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return Response.json({ error: "Linux.do OAuth 未配置" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
  });

  const authUrl = `https://connect.linux.do/oauth2/authorize?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
