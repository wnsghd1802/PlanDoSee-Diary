import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

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

export function createSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      type: "plandosee-session"
    },
    requiredEnv("SESSION_SECRET"),
    {
      algorithm: "HS256",
      expiresIn: SESSION_TTL_SECONDS,
      issuer: "plandosee-diary",
      audience: "plandosee-web"
    }
  );
}

export function verifySessionToken(token) {
  return jwt.verify(token, requiredEnv("SESSION_SECRET"), {
    algorithms: ["HS256"],
    issuer: "plandosee-diary",
    audience: "plandosee-web"
  });
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
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
