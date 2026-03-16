const { getBootstrapData, getMissingContacts } = require("./bootstrap");
const { selectRows } = require("./supabase");

function getSupportData() {
  return getBootstrapData().support || {};
}

function getCareLabel(studentId) {
  return getSupportData().careByStudentId?.[studentId] || "";
}

function getFreePassInfo(studentId) {
  return getSupportData().freePassByStudentId?.[studentId] || null;
}

function isFreePassEligible(studentId) {
  return Boolean(getFreePassInfo(studentId));
}

function isVoucherEligible(grade) {
  return Array.isArray(getSupportData().voucherGrades) && getSupportData().voucherGrades.includes(Number(grade));
}

function buildRemark(student, selections) {
  const remarks = [];
  if (isFreePassEligible(student.id)) {
    remarks.push("자유수강권 대상");
  }
  if (isVoucherEligible(student.grade) && selections.length) {
    remarks.push("3학년 바우처 대상");
  }
  return remarks.join(" / ");
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return String(phone || "");
}

function formatDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(/\.$/, "");
}

function parseMoneyValues(text) {
  return String(text || "")
    .match(/\d[\d,]*/g)
    ?.map((value) => Number(String(value).replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0) || [];
}

function parseFeeAmount(value) {
  if (String(value || "").includes("무료")) {
    return 0;
  }
  return parseMoneyValues(value)[0] || 0;
}

function parseMaterialEstimate(note) {
  const text = String(note || "").trim();
  if (!text) {
    return {
      min: 0,
      max: 0,
      label: "-",
      hasEstimate: false,
    };
  }

  const values = parseMoneyValues(text);
  if (!values.length) {
    return {
      min: 0,
      max: 0,
      label: text,
      hasEstimate: false,
    };
  }

  if (text.includes("~") && values.length >= 2) {
    if (values.length === 2) {
      return {
        min: values[0],
        max: values[1],
        label: text,
        hasEstimate: true,
      };
    }
    const fixed = values[0];
    return {
      min: fixed + values[1],
      max: fixed + values[2],
      label: text,
      hasEstimate: true,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: total,
    max: total,
    label: text,
    hasEstimate: true,
  };
}

function detectMaterialItemLabel(note) {
  const text = String(note || "");
  if (!text.trim()) return "-";
  if (text.includes("준비")) return "준비물";
  if (text.includes("재료") && text.includes("교재")) return "재료·교재";
  if (text.includes("재료")) return "재료비";
  if (text.includes("교재")) return "교재비";
  return "안내문 참고";
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatMoneyRange(min, max) {
  if (!min && !max) {
    return "0원";
  }
  if (min === max) {
    return formatMoney(min);
  }
  return `${formatMoney(min)} ~ ${formatMoney(max)}`;
}

function buildCourseCost(course) {
  const feeAmount = parseFeeAmount(course.fee);
  const material = parseMaterialEstimate(course.note);
  return {
    feeAmount,
    feeLabel: course.fee,
    materialItemLabel: detectMaterialItemLabel(course.note),
    materialCostMin: material.min,
    materialCostMax: material.max,
    materialCostLabel: material.hasEstimate ? formatMoneyRange(material.min, material.max) : "-",
    materialGuideLabel: material.label,
    hasMaterialEstimate: material.hasEstimate,
    totalMin: feeAmount + material.min,
    totalMax: feeAmount + material.max,
  };
}

function summarizeSelections(selections) {
  const summary = selections.reduce(
    (acc, selection) => {
      acc.feeAmount += selection.feeAmount || 0;
      acc.materialCostMin += selection.materialCostMin || 0;
      acc.materialCostMax += selection.materialCostMax || 0;
      acc.totalMin += selection.totalMin || 0;
      acc.totalMax += selection.totalMax || 0;
      if (selection.hasMaterialEstimate) {
        acc.hasEstimate = true;
      }
      return acc;
    },
    {
      feeAmount: 0,
      materialCostMin: 0,
      materialCostMax: 0,
      totalMin: 0,
      totalMax: 0,
      hasEstimate: false,
    }
  );

  return {
    ...summary,
    feeLabel: formatMoney(summary.feeAmount),
    materialCostLabel: formatMoneyRange(summary.materialCostMin, summary.materialCostMax),
    totalLabel: formatMoneyRange(summary.totalMin, summary.totalMax),
  };
}

function getSlotCatalog() {
  const bootstrap = getBootstrapData();
  const catalog = {};
  bootstrap.courses.forEach((course) => {
    const cost = buildCourseCost(course);
    course.slots.forEach((slot) => {
      catalog[slot.id] = { course, slot, cost };
    });
  });
  return catalog;
}

function buildSelectionDetail(record) {
  return {
    slotId: record.slot.id,
    courseId: record.course.id,
    courseName: record.course.name,
    period: record.slot.period,
    days: record.slot.days,
    start: record.slot.start,
    end: record.slot.end,
    room: record.slot.room || record.course.room || "",
    teacher: record.course.teacher || "",
    feeAmount: record.cost.feeAmount,
    feeLabel: record.cost.feeLabel,
    materialItemLabel: record.cost.materialItemLabel,
    materialCostMin: record.cost.materialCostMin,
    materialCostMax: record.cost.materialCostMax,
    materialCostLabel: record.cost.materialCostLabel,
    materialGuideLabel: record.cost.materialGuideLabel,
    hasMaterialEstimate: record.cost.hasMaterialEstimate,
    totalMin: record.cost.totalMin,
    totalMax: record.cost.totalMax,
    totalLabel: formatMoneyRange(record.cost.totalMin, record.cost.totalMax),
  };
}

function validateSelections(student, selections) {
  const catalog = getSlotCatalog();
  const uniqueSelections = [];
  const picked = [];
  const pickedCourseIds = new Set();

  for (const slotId of selections) {
    const record = catalog[slotId];
    if (!record) {
      throw new Error("존재하지 않는 강좌 시간입니다.");
    }
    if (uniqueSelections.includes(slotId)) {
      continue;
    }
    if (student.grade < record.slot.gradeMin || student.grade > record.slot.gradeMax) {
      throw new Error(`${record.course.name} ${record.slot.period}는 신청 대상 학년이 아닙니다.`);
    }
    if (pickedCourseIds.has(record.course.id)) {
      throw new Error(`${record.course.name}는 한 시간대만 선택할 수 있습니다.`);
    }
    const conflict = picked.find((item) => item.slot.period === record.slot.period && item.slot.days.some((day) => record.slot.days.includes(day)));
    if (conflict) {
      throw new Error(`${record.course.name} ${record.slot.period}는 ${conflict.course.name} ${conflict.slot.period}와 시간이 겹칩니다.`);
    }
    uniqueSelections.push(slotId);
    picked.push(record);
    pickedCourseIds.add(record.course.id);
  }

  return uniqueSelections;
}

async function getStudentByCredentials({ grade, classRoom, name, phone }) {
  const rows = await selectRows("students", {
    select: "id,name,grade,grade_label,class_room,class_label,number_label,phone,active",
    grade: `eq.${grade}`,
    class_room: `eq.${classRoom}`,
    name: `eq.${name}`,
    phone: `eq.${String(phone || "").replace(/\D/g, "")}`,
    active: "eq.true",
  });
  return rows[0] || null;
}

async function getStudentById(studentId) {
  const rows = await selectRows("students", {
    select: "id,name,grade,grade_label,class_room,class_label,number_label,phone,active",
    id: `eq.${studentId}`,
    active: "eq.true",
  });
  return rows[0] || null;
}

async function getStudentSelections(studentId) {
  const rows = await selectRows("applications", {
    select: "slot_id,updated_at",
    student_id: `eq.${studentId}`,
    order: "slot_id.asc",
  });
  return {
    selections: rows.map((row) => row.slot_id),
    updatedAt: rows.reduce((latest, row) => (!latest || row.updated_at > latest ? row.updated_at : latest), ""),
  };
}

async function getStudentPayload(studentId) {
  const student = await getStudentById(studentId);
  if (!student) {
    return null;
  }

  const { selections, updatedAt } = await getStudentSelections(studentId);
  const catalog = getSlotCatalog();
  const detailedSelections = selections
    .map((slotId) => catalog[slotId])
    .filter(Boolean)
    .map(buildSelectionDetail);

  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      gradeLabel: student.grade_label,
      classRoom: student.class_room,
      classLabel: student.class_label,
      numberLabel: student.number_label || "",
      careLabel: getCareLabel(student.id),
      freePassInfo: getFreePassInfo(student.id),
      phoneMasked: maskPhone(student.phone),
      updatedAtLabel: formatDateLabel(updatedAt),
      isFreePassEligible: isFreePassEligible(student.id),
      isVoucherEligible: isVoucherEligible(student.grade),
    },
    selections,
    selectionDetails: detailedSelections,
    costSummary: summarizeSelections(detailedSelections),
  };
}

async function buildAdminSummary() {
  const [students, applications, slots] = await Promise.all([
    selectRows("students", {
      select: "id,name,grade,grade_label,class_room,class_label,number_label,phone",
      active: "eq.true",
      order: "grade.asc,class_room.asc,name.asc",
    }),
    selectRows("applications", {
      select: "student_id,slot_id,updated_at",
      order: "student_id.asc,slot_id.asc",
    }),
    selectRows("course_slots", {
      select: "id,course_id,period,start_time,end_time,days_json,room",
    }),
  ]);

  const bootstrap = getBootstrapData();
  const courseMap = {};
  bootstrap.courses.forEach((course) => {
    courseMap[course.id] = {
      ...course,
      cost: buildCourseCost(course),
    };
  });

  const slotMap = {};
  slots.forEach((slot) => {
    const course = courseMap[slot.course_id];
    if (!course) return;
    const days = Array.isArray(slot.days_json) ? slot.days_json : JSON.parse(slot.days_json);
    slotMap[slot.id] = buildSelectionDetail({
      course,
      slot: {
        id: slot.id,
        period: slot.period,
        start: slot.start_time,
        end: slot.end_time,
        days,
        room: slot.room || course.room || "",
      },
      cost: course.cost,
    });
  });

  const grouped = {};
  applications.forEach((row) => {
    if (!grouped[row.student_id]) {
      grouped[row.student_id] = [];
    }
    grouped[row.student_id].push(row);
  });

  const studentEntries = students.map((student) => {
    const rows = grouped[student.id] || [];
    const latest = rows.reduce((max, row) => (!max || row.updated_at > max ? row.updated_at : max), "");
    const detailedSelections = rows
      .map((row) => slotMap[row.slot_id])
      .filter(Boolean)
      .sort((a, b) => a.courseName.localeCompare(b.courseName, "ko") || a.period.localeCompare(b.period, "ko"));

    return {
      id: student.id,
      name: student.name,
      grade: student.grade,
      gradeLabel: student.grade_label,
      classRoom: student.class_room,
      classLabel: student.class_label,
      numberLabel: student.number_label || "",
      careLabel: getCareLabel(student.id),
      freePassInfo: getFreePassInfo(student.id),
      phone: student.phone,
      phoneMasked: maskPhone(student.phone),
      updatedAtLabel: formatDateLabel(latest),
      isFreePassEligible: isFreePassEligible(student.id),
      isVoucherEligible: isVoucherEligible(student.grade),
      remark: buildRemark(student, detailedSelections),
      selections: detailedSelections,
      costSummary: summarizeSelections(detailedSelections),
    };
  });

  const appliedStudentCount = studentEntries.filter((student) => student.selections.length > 0).length;
  const selectionCount = studentEntries.reduce((sum, student) => sum + student.selections.length, 0);
  const appliedEntries = studentEntries.filter((student) => student.selections.length > 0);
  const totalSummary = summarizeSelections(appliedEntries.flatMap((student) => student.selections));

  return {
    studentCount: students.length,
    appliedStudentCount,
    selectionCount,
    totalCostSummary: totalSummary,
    students: studentEntries,
    missingContacts: getMissingContacts(),
    exportUrl: "/api/admin/export",
  };
}

module.exports = {
  getBootstrapData,
  getMissingContacts,
  getStudentByCredentials,
  getStudentById,
  getStudentSelections,
  getStudentPayload,
  validateSelections,
  buildAdminSummary,
  buildCourseCost,
  summarizeSelections,
  formatDateLabel,
  formatMoney,
  formatMoneyRange,
  isVoucherEligible,
};
