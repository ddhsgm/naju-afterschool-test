const { requireStudent } = require("./_lib/auth");
const { getStudentById, validateSelections, formatDateLabel } = require("./_lib/domain");
const { deleteRows, insertRows } = require("./_lib/supabase");
const { sendJson, methodNotAllowed, readBody } = require("./_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const session = requireStudent(req);
    const student = await getStudentById(session.studentId);
    if (!student) {
      return sendJson(res, 401, { error: "학생 정보를 찾지 못했습니다." });
    }
    const body = readBody(req);
    const selections = validateSelections(student, Array.isArray(body.selections) ? body.selections : []);
    await deleteRows("applications", { student_id: `eq.${student.id}` });
    if (selections.length) {
      const now = new Date().toISOString();
      await insertRows(
        "applications",
        selections.map((slotId) => ({
          student_id: student.id,
          slot_id: slotId,
          updated_at: now,
        }))
      );
      return sendJson(res, 200, {
        ok: true,
        selections,
        updatedAt: now,
        updatedAtLabel: formatDateLabel(now),
      });
    }
    return sendJson(res, 200, { ok: true, selections: [], updatedAtLabel: "" });
  } catch (error) {
    const status = error.message && (error.message.includes("로그인") || error.message.includes("학생")) ? 401 : 400;
    return sendJson(res, status, { error: error.message || "신청 저장 중 오류가 발생했습니다." });
  }
};
