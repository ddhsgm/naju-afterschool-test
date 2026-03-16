const { requireStudent } = require("./_lib/auth");
const { getStudentPayload } = require("./_lib/domain");
const { sendJson, methodNotAllowed } = require("./_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const session = requireStudent(req);
    const payload = await getStudentPayload(session.studentId);
    if (!payload) {
      return sendJson(res, 401, { error: "학생 정보를 찾지 못했습니다." });
    }
    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 401, { error: error.message || "학부모 로그인이 필요합니다." });
  }
};
