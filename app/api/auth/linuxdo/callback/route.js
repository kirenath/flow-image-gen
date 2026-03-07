import { NextResponse } from "next/server";
import { saveOAuthUser, isAdmin } from "@/lib/oauth";

/**
 * GET /api/auth/linuxdo/callback — Handle OAuth callback
 * 1. Exchange code for access_token
 * 2. Fetch user info
 * 3. Validate trust_level, active, silenced
 * 4. Save user, set session cookie, redirect to /
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Build login URL for error redirects
  const loginUrl = new URL("/login", request.url);

  if (error) {
    loginUrl.searchParams.set("error", `授权被拒绝: ${error}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", "未收到授权码");
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.LINUXDO_CLIENT_ID;
  const clientSecret = process.env.LINUXDO_CLIENT_SECRET;
  const redirectUri = process.env.LINUXDO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    loginUrl.searchParams.set("error", "OAuth 服务端配置缺失");
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Step 1: Exchange code for access_token
    const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[OAuth] Token exchange failed:", errText);
      loginUrl.searchParams.set("error", "令牌交换失败");
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      loginUrl.searchParams.set("error", "未获取到访问令牌");
      return NextResponse.redirect(loginUrl);
    }

    // Step 2: Fetch user info
    const userRes = await fetch("https://connect.linux.do/api/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      console.error("[OAuth] User info fetch failed:", userRes.status);
      loginUrl.searchParams.set("error", "获取用户信息失败");
      return NextResponse.redirect(loginUrl);
    }

    const userInfo = await userRes.json();
    console.log(
      `[OAuth] User: ${userInfo.username} (ID: ${userInfo.id}, TL: ${userInfo.trust_level})`,
    );

    // Step 3: Validate user
    if (!userInfo.active) {
      loginUrl.searchParams.set("error", "账号未激活");
      return NextResponse.redirect(loginUrl);
    }

    if (userInfo.silenced) {
      loginUrl.searchParams.set("error", "账号已被禁言");
      return NextResponse.redirect(loginUrl);
    }

    if (userInfo.trust_level < 2 && !isAdmin(userInfo.id)) {
      loginUrl.searchParams.set(
        "error",
        `信任等级不足（当前 TL${userInfo.trust_level}，需要 TL2+）`,
      );
      return NextResponse.redirect(loginUrl);
    }

    // Step 4: Save user and set session
    saveOAuthUser(userInfo);

    const sessionValue = `linuxdo:${userInfo.id}`;
    const homeUrl = new URL("/", request.url);
    const response = NextResponse.redirect(homeUrl);

    response.cookies.set("flow_auth", sessionValue, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err) {
    console.error("[OAuth] Callback error:", err);
    loginUrl.searchParams.set("error", "登录过程出错，请重试");
    return NextResponse.redirect(loginUrl);
  }
}
