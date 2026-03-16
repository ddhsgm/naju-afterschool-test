const { requireAdmin } = require("../_lib/auth");
const { buildAdminSummary } = require("../_lib/domain");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    requireAdmin(req);
    const summary = await buildAdminSummary();
    const rows = [
      ["학년", "반", "이름", "연락처", "신청수", "신청내역", "저장시각"],
      ...summary.students.map((student) => [
        student.gradeLabel,
        student.classLabel,
        student.name,
        student.phoneMasked,
        String(student.selections.length),
        student.selections
          .map((selection) => `${selection.courseName} ${selection.period} (${selection.days.join(", ")} ${selection.start}~${selection.end})`)
          .join(" / "),
        student.updatedAtLabel,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="afterschool-applications.csv"');
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(401).json({ error: error.message || "관리자 로그인이 필요합니다." });
  }
};
