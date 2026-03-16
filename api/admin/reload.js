const { requireAdmin } = require("../_lib/auth");
const { sendJson, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    requireAdmin(req);
    return sendJson(res, 200, {
      ok: true,
      message: "무료 배포 버전에서는 관리자 화면에서 원본자료를 바로 다시 읽지 않습니다. 원본을 수정한 뒤 build_data.py를 실행하고 재배포해 주세요.",
    });
  } catch (error) {
    return sendJson(res, 401, { error: error.message || "관리자 로그인이 필요합니다." });
  }
};
