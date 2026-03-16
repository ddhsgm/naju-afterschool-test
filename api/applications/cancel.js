const { requireStudent } = require("../_lib/auth");
const { deleteRows } = require("../_lib/supabase");
const { sendJson, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const session = requireStudent(req);
    await deleteRows("applications", { student_id: `eq.${session.studentId}` });
    return sendJson(res, 200, { ok: true, selections: [], updatedAtLabel: "" });
  } catch (error) {
    return sendJson(res, 401, { error: error.message || "학부모 로그인이 필요합니다." });
  }
};
