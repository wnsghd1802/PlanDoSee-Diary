import bcrypt from "bcryptjs";
import {
  clearSessionCookie,
  getAdminClient,
  getSessionFromRequest,
  readBody,
  revokeAllUserSessions,
  sendJson
} from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "POST 요청만 허용됩니다." }, { Allow: "POST" });
  }

  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, message: "로그인이 필요합니다." });
    }

    const body = readBody(req);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return sendJson(res, 400, { ok: false, message: "현재 비밀번호와 새 비밀번호를 입력해 주세요." });
    }

    if (newPassword.length < 8) {
      return sendJson(res, 400, { ok: false, message: "새 비밀번호는 8자 이상 입력해 주세요." });
    }

    if (bcrypt.truncates(newPassword)) {
      return sendJson(res, 400, { ok: false, message: "새 비밀번호가 너무 깁니다." });
    }

    const supabase = getAdminClient();

    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, password_hash")
      .eq("id", session.user.id)
      .single();

    if (error) throw error;

    const matched = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matched) {
      return sendJson(res, 401, { ok: false, message: "현재 비밀번호가 올바르지 않습니다." });
    }

    // 기존 비밀번호와 같은 값으로 변경하는 것은 허용하지 않습니다.
    const sameAsCurrent = await bcrypt.compare(newPassword, user.password_hash);
    if (sameAsCurrent) {
      return sendJson(res, 400, {
        ok: false,
        message: "새 비밀번호가 현재 비밀번호와 같습니다."
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabase
      .from("app_users")
      .update({ password_hash: newHash })
      .eq("id", user.id);

    if (updateError) throw updateError;

    // 비밀번호 변경 시 이 사용자의 모든 기존 세션을 폐기
    await revokeAllUserSessions(user.id);

    res.setHeader("Set-Cookie", clearSessionCookie());

    return sendJson(res, 200, {
      ok: true,
      message: "비밀번호가 변경되었습니다. 다시 로그인해 주세요."
    });
  } catch (error) {
    console.error("change password error:", error?.message || error);
    return sendJson(res, 500, { ok: false, message: "비밀번호 변경 중 오류가 발생했습니다." });
  }
}
