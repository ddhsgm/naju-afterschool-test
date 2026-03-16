const { createSessionCookie } = require("../_lib/auth");
const { sendJson, methodNotAllowed, readBody } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  const body = readBody(req);
  const password = String(body.password || "");
  const expected = process.env.AFTERSCHOOL_ADMIN_PASSWORD || "naju-admin-2026";

  if (password !== expected) {
    return sendJson(res, 401, { error: "관리자 비밀번호가 올바르지 않습니다." });
  }

  return sendJson(res, 200, { ok: true }, {
    "Set-Cookie": createSessionCookie({ type: "admin" }),
  });
};
