import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";
import { cookies } from "next/headers";
import { validateKey } from "@/lib/keys";

export async function POST(req) {
  // Auth check
  const cookieStore = await cookies();
  const authKey = cookieStore.get("flow_auth")?.value;
  if (!authKey || !validateKey(authKey)) {
    return Response.json({ error: "未认证" }, { status: 401 });
  }

  const { filename, filetype } = await req.json();

  // Discreet naming: img_timestamp_random.ext
  const ext = filename.split(".").pop() || "png";
  const key = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: filetype,
  });

  const url = await getSignedUrl(r2, command, { expiresIn: 1800 }); // 30 min
  const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${key}`;

  return Response.json({ url, publicUrl, key });
}
