import { clearSessionCookie, sendJson } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return sendJson(res, 200, { ok: true });
}
