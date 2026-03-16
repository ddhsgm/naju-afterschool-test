const { clearSessionCookie } = require("./_lib/auth");
const { sendJson, methodNotAllowed } = require("./_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }
  return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
};
