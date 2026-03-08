import { cookies } from "next/headers";

export async function POST() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEV_BYPASS !== "true"
  ) {
    return Response.json(
      { error: "This endpoint is only available in local development mode" },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: "flow_auth",
    value: "dev-admin-123456",
    httpOnly: true,
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return Response.json({ success: true, message: "Logged in as DevAdmin" });
}
