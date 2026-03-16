const crypto = require("crypto");

const COOKIE_NAME = "afterschool_session";

function getSecret() {
  return process.env.SESSION_SECRET || "change-this-session-secret";
}

function encodeSession(payload) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeSession(token) {
  if (!token || !token.includes(".")) {
    return null;
  }
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  const result = {};
  cookieHeader.split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return;
    result[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  });
  return result;
}

function getSession(req) {
  const cookies = parseCookies(req);
  return decodeSession(cookies[COOKIE_NAME]);
}

function createSessionCookie(payload, maxAgeSeconds = 60 * 60 * 12) {
  const value = encodeSession({
    ...payload,
    exp: Date.now() + maxAgeSeconds * 1000,
  });
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie() {
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function requireStudent(req) {
  const session = getSession(req);
  if (!session || session.type !== "student" || !session.studentId) {
    throw new Error("학부모 로그인이 필요합니다.");
  }
  return session;
}

function requireAdmin(req) {
  const session = getSession(req);
  if (!session || session.type !== "admin") {
    throw new Error("관리자 로그인이 필요합니다.");
  }
  return session;
}

module.exports = {
  createSessionCookie,
  clearSessionCookie,
  getSession,
  requireStudent,
  requireAdmin,
};
