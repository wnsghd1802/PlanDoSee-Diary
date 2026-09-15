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

    if (!validUsername(username)) {
      return sendJson(res, 400, {
        ok: false,
        message: "아이디는 영문 소문자·숫자·밑줄(_)-하이픈(-) 조합 4~20자로 입력해 주세요."
      });
    }

    if (password.length < 8) {
      return sendJson(res, 400, { ok: false, message: "비밀번호는 8자 이상 입력해 주세요." });
    }

    // bcrypt는 72바이트를 넘는 입력을 잘라 처리하므로, 과제에서는 잘림 자체를 거부합니다.
    if (bcrypt.truncates(password)) {
      return sendJson(res, 400, { ok: false, message: "비밀번호가 너무 깁니다." });
    }

    const supabase = getAdminClient();

    const { data: existing, error: findError } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) {
      return sendJson(res, 409, { ok: false, message: "이미 사용 중인 아이디입니다." });
    }

    // 매번 새로운 무작위 salt가 생성되며, cost factor 12를 사용합니다.
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: insertError } = await supabase
      .from("app_users")
      .insert({ username, password_hash: passwordHash })
      .select("id, username, created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return sendJson(res, 409, { ok: false, message: "이미 사용 중인 아이디입니다." });
      }
      throw insertError;
    }

    const token = createSessionToken(user);
    res.setHeader("Set-Cookie", sessionCookie(token));

    return sendJson(res, 201, {
      ok: true,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error("signup error:", error?.message || error);
    return sendJson(res, 500, { ok: false, message: "회원가입 처리 중 오류가 발생했습니다." });
  }
}
