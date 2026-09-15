import bcrypt from "bcryptjs";
import {
  getAdminClient,
  normalizeUsername,
  readBody,
  sendJson,
  validUsername,
  createSessionToken,
  sessionCookie
} from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
  }

  try {
    const body = readBody(req);
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!validUsername(username) || !password) {
      return sendJson(res, 401, {
        ok: false,
        message: "아이디 또는 비밀번호가 올바르지 않습니다."
      });
    }

    const supabase = getAdminClient();

    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, password_hash")
      .eq("username", username)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return sendJson(res, 401, {
        ok: false,
        message: "아이디 또는 비밀번호가 올바르지 않습니다."
      });
    }

    const matched = await bcrypt.compare(password, user.password_hash);

    if (!matched) {
      return sendJson(res, 401, {
        ok: false,
        message: "아이디 또는 비밀번호가 올바르지 않습니다."
      });
    }

    const token = createSessionToken(user);
    res.setHeader("Set-Cookie", sessionCookie(token));

    return sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error("login error:", error?.message || error);
    return sendJson(res, 500, {
      ok: false,
      message: "로그인 처리 중 오류가 발생했습니다."
    });
  }
}
