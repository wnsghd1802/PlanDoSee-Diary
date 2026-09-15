import { getSessionFromRequest, sendJson } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, message: "GET 요청만 허용됩니다." }, { Allow: "GET" });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return sendJson(res, 401, { ok: false, message: "로그인이 필요합니다." });
  }

  return sendJson(res, 200, {
    ok: true,
    user: {
      id: session.sub,
      username: session.username
    }
  });
}
