import {
  clearSessionCookie,
  revokeCurrentSession,
  sendJson
} from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
  }

  try {
    await revokeCurrentSession(req);
  } catch (error) {
    console.error("logout revoke error:", error?.message || error);
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return sendJson(res, 200, { ok: true });
}
