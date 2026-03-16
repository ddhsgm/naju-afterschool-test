const { requireAdmin } = require("../_lib/auth");
const { buildAdminSummary } = require("../_lib/domain");
const { sendJson, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    requireAdmin(req);
    const summary = await buildAdminSummary();
    return sendJson(res, 200, summary);
  } catch (error) {
    return sendJson(res, 401, { error: error.message || "관리자 로그인이 필요합니다." });
  }
};
