import { getSessionFromRequest, sendJson } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, message: "GET 요청만 허용됩니다." }, { Allow: "GET" });
  }

  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return sendJson(res, 401, { ok: false, message: "로그인이 필요합니다." });
    }

    return sendJson(res, 200, {
      ok: true,
      user: session.user,
      session: {
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    console.error("session check error:", error?.message || error);
    return sendJson(res, 500, { ok: false, message: "로그인 상태를 확인하지 못했습니다." });
  }
}
