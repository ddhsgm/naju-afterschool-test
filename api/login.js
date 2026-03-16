const { createSessionCookie } = require("./_lib/auth");
const { getStudentByCredentials, getStudentPayload } = require("./_lib/domain");
const { sendJson, methodNotAllowed, readBody } = require("./_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = readBody(req);
    const student = await getStudentByCredentials(body);
    if (!student) {
      return sendJson(res, 401, { error: "일치하는 학생 정보를 찾지 못했습니다. 입력값을 다시 확인해 주세요." });
    }
    const payload = await getStudentPayload(student.id);
    return sendJson(res, 200, payload, {
      "Set-Cookie": createSessionCookie({ type: "student", studentId: student.id }),
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "로그인 처리 중 오류가 발생했습니다." });
  }
};
