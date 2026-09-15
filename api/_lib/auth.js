import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const SESSION_COOKIE = "plandosee_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8시간

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getAdminClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

function parseCookies(header = "") {
  const result = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function createServerSession(userId) {
  const supabase = getAdminClient();
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase
    .from("app_sessions")
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

  if (error) throw error;

  return { token, expiresAt };
}

export async function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const supabase = getAdminClient();

  const { data: session, error } = await supabase
    .from("app_sessions")
    .select("id, user_id, created_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabase.from("app_sessions").delete().eq("id", session.id);
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("id, username")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) return null;

  return {
    sessionId: session.id,
    user,
    createdAt: session.created_at,
    expiresAt: session.expires_at
  };
}

export async function revokeCurrentSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return;

  const supabase = getAdminClient();
  await supabase
    .from("app_sessions")
    .delete()
    .eq("token_hash", hashToken(token));
}

export async function revokeAllUserSessions(userId) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from("app_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}

export function sessionCookie(token) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function sendJson(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(data));
}

export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function validUsername(username) {
  return /^[a-z0-9_-]{4,20}$/.test(username);
}

export function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase();
}
