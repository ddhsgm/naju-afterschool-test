const { requireAdmin } = require("../_lib/auth");
const { buildAdminSummary, getBootstrapData } = require("../_lib/domain");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeWorksheetName(name) {
  return String(name || "Sheet")
    .replace(/[\\/:*?\[\]]/g, "_")
    .slice(0, 31);
}

function makeCell(value, styleId = "Body") {
  if (value === null || value === undefined || value === "") {
    return `<Cell ss:StyleID="${styleId}"/>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function makeRow(values, styleId = "Body") {
  return `<Row>${values.map((value) => makeCell(value, styleId)).join("")}</Row>`;
}

function makeWorksheet(name, rows) {
  return `
    <Worksheet ss:Name="${escapeXml(sanitizeWorksheetName(name))}">
      <Table>
        ${rows.join("")}
      </Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <Selected/>
        <FreezePanes/>
        <FrozenNoSplit/>
        <SplitHorizontal>3</SplitHorizontal>
        <TopRowBottomPane>3</TopRowBottomPane>
        <ActivePane>2</ActivePane>
        <ProtectObjects>False</ProtectObjects>
        <ProtectScenarios>False</ProtectScenarios>
      </WorksheetOptions>
    </Worksheet>
  `;
}

function buildSummarySheet(bootstrap, summary) {
  const countBySlot = {};
  summary.students.forEach((student) => {
    student.selections.forEach((selection) => {
      countBySlot[selection.slotId] = (countBySlot[selection.slotId] || 0) + 1;
    });
  });

  const responseRate = summary.studentCount ? ((summary.appliedStudentCount / summary.studentCount) * 100).toFixed(1) : "0.0";
  const rows = [
    makeRow(["2026. 3월 방과후학교 프로그램 수강신청 현황"], "Title"),
    makeRow([`전체 ${summary.studentCount}명 중 ${summary.appliedStudentCount}명 응답 (${responseRate}%) / 복수선택 가능`], "SubTitle"),
    makeRow([""], "Body"),
    makeRow(["과목명", "수업요일", "차시 (시간)", "대상학년", "신청자 수", "소계"], "Header"),
  ];

  bootstrap.courses.forEach((course) => {
    const subtotal = course.slots.reduce((sum, slot) => sum + (countBySlot[slot.id] || 0), 0);
    course.slots.forEach((slot, index) => {
      rows.push(
        makeRow(
          [
            index === 0 ? course.name : "",
            index === 0 ? course.days.join(", ") : "",
            `${slot.period} (${slot.start}~${slot.end})`,
            `${slot.gradeMin}-${slot.gradeMax}학년`,
            countBySlot[slot.id] || 0,
            index === 0 ? subtotal : "",
          ],
          "Body"
        )
      );
    });
  });

  return makeWorksheet("과목별 신청현황", rows);
}

function buildOverallSheet(summary) {
  const rows = [
    makeRow(["2026. 3월 방과후학교 수강생 현황"], "Title"),
    makeRow([""], "Body"),
    makeRow(["순번", "", "성명", "학년", "반", "번호", "돌봄", "보호자 연락처", "프로그램명", "운영요일", "참여시간", "수강료", "비고"], "Header"),
  ];

  const appliedStudents = summary.students.filter((student) => student.selections.length > 0);
  appliedStudents.forEach((student, studentIndex) => {
    student.selections.forEach((selection, selectionIndex) => {
      rows.push(
        makeRow(
          [
            selectionIndex === 0 ? studentIndex + 1 : "",
            "",
            student.name,
            student.grade,
            student.classRoom,
            student.numberLabel || "",
            student.careLabel || "",
            student.phoneMasked,
            selection.courseName,
            selection.days.join(", "),
            selection.period,
            selection.feeAmount > 0 ? selection.feeAmount : "무료",
            selectionIndex === 0 ? student.remark || "" : "",
          ],
          "Body"
        )
      );
    });
  });

  return makeWorksheet("전체현황", rows);
}

function buildCourseSheets(bootstrap, summary) {
  const appliedStudents = summary.students.filter((student) => student.selections.length > 0);

  return bootstrap.courses.map((course, courseIndex) => {
    const rows = [
      makeRow([`${course.name} 수강생 명단`], "Title"),
      makeRow([""], "Body"),
      makeRow(["순번", "성명", "학년", "반", "번호", "돌봄", "보호자 연락처", "참여시간", "수강료(A)", "재료·교재명", "재료·교재비(B)", "수납 수강료(A+B)", "비고"], "Header"),
    ];

    const courseSelections = appliedStudents
      .flatMap((student) =>
        student.selections
          .filter((selection) => selection.courseId === course.id)
          .map((selection) => ({ student, selection }))
      )
      .sort((a, b) => {
        return (
          a.student.grade - b.student.grade ||
          a.student.classRoom - b.student.classRoom ||
          a.student.name.localeCompare(b.student.name, "ko") ||
          a.selection.period.localeCompare(b.selection.period, "ko")
        );
      });

    courseSelections.forEach(({ student, selection }, index) => {
      const materialCostValue =
        selection.materialCostMin === 0 && selection.materialCostMax === 0
          ? "-"
          : selection.materialCostMin === selection.materialCostMax
            ? selection.materialCostMin
            : selection.materialCostLabel;

      const totalValue =
        selection.totalMin === 0 && selection.totalMax === 0
          ? "무료"
          : selection.totalMin === selection.totalMax
            ? selection.totalMin
            : selection.totalLabel;

      rows.push(
        makeRow(
          [
            index + 1,
            student.name,
            student.grade,
            student.classRoom,
            student.numberLabel || "",
            student.careLabel || "",
            student.phoneMasked,
            selection.period,
            selection.feeAmount > 0 ? selection.feeAmount : "무료",
            selection.materialItemLabel || "-",
            materialCostValue,
            totalValue,
            student.remark || "",
          ],
          "Body"
        )
      );
    });

    return makeWorksheet(`${courseIndex + 1}.${course.name}`, rows);
  });
}

function buildWorkbookXml(bootstrap, summary) {
  const worksheets = [
    buildSummarySheet(bootstrap, summary),
    buildOverallSheet(summary),
    ...buildCourseSheets(bootstrap, summary),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Malgun Gothic" ss:Size="10"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Malgun Gothic" ss:Size="14" ss:Bold="1"/>
    </Style>
    <Style ss:ID="SubTitle">
      <Font ss:FontName="Malgun Gothic" ss:Size="10" ss:Color="#475569"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Malgun Gothic" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
    <Style ss:ID="Body">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    requireAdmin(req);
    const [summary, bootstrap] = await Promise.all([buildAdminSummary(), Promise.resolve(getBootstrapData())]);
    const xml = buildWorkbookXml(bootstrap, summary);
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="naju-afterschool-export.xls"');
    return res.status(200).send(xml);
  } catch (error) {
    return res.status(401).json({ error: error.message || "관리자 로그인이 필요합니다." });
  }
};
