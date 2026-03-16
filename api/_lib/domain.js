const { getBootstrapData, getMissingContacts } = require("./bootstrap");
const { selectRows } = require("./supabase");

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
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

function getSlotCatalog() {
  const bootstrap = getBootstrapData();
  const catalog = {};
  bootstrap.courses.forEach((course) => {
    course.slots.forEach((slot) => {
      catalog[slot.id] = { course, slot };
    });
  });
  return catalog;
}

function validateSelections(student, selections) {
  const catalog = getSlotCatalog();
  const uniqueSelections = [];
  const picked = [];
  const pickedCourseIds = new Set();

  for (const slotId of selections) {
    const record = catalog[slotId];
    if (!record) {
      throw new Error("존재하지 않는 강좌 시간을 선택했습니다.");
    }
    if (uniqueSelections.includes(slotId)) {
      continue;
    }
    if (student.grade < record.slot.gradeMin || student.grade > record.slot.gradeMax) {
      throw new Error(`${record.course.name} ${record.slot.period}은(는) 신청 대상 학년이 아닙니다.`);
    }
    if (pickedCourseIds.has(record.course.id)) {
      throw new Error(`${record.course.name}은(는) 한 시간대만 선택할 수 있습니다.`);
    }
    const conflict = picked.find((item) => {
      return item.slot.period === record.slot.period && item.slot.days.some((day) => record.slot.days.includes(day));
    });
    if (conflict) {
      throw new Error(`${record.course.name} ${record.slot.period}은(는) ${conflict.course.name} ${conflict.slot.period}과 시간이 겹칩니다.`);
    }
    uniqueSelections.push(slotId);
    picked.push(record);
    pickedCourseIds.add(record.course.id);
  }

  return uniqueSelections;
}

async function getStudentByCredentials({ grade, classRoom, name, phone }) {
  const rows = await selectRows("students", {
    select: "id,name,grade,grade_label,class_room,class_label,phone,active",
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
    select: "id,name,grade,grade_label,class_room,class_label,phone,active",
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
  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      gradeLabel: student.grade_label,
      classRoom: student.class_room,
      classLabel: student.class_label,
      phoneMasked: maskPhone(student.phone),
      updatedAtLabel: formatDateLabel(updatedAt),
    },
    selections,
  };
}

async function buildAdminSummary() {
  const [students, applications, slots] = await Promise.all([
    selectRows("students", {
      select: "id,name,grade,grade_label,class_room,class_label,phone",
      active: "eq.true",
      order: "grade.asc,class_room.asc,name.asc",
    }),
    selectRows("applications", {
      select: "student_id,slot_id,updated_at",
      order: "student_id.asc,slot_id.asc",
    }),
    selectRows("course_slots", {
      select: "id,course_id,period,start_time,end_time,days_json",
    }),
  ]);

  const courseMap = {};
  getBootstrapData().courses.forEach((course) => {
    courseMap[course.id] = course.name;
  });

  const slotMap = {};
  slots.forEach((slot) => {
    slotMap[slot.id] = {
      slotId: slot.id,
      courseId: slot.course_id,
      courseName: courseMap[slot.course_id] || slot.course_id,
      period: slot.period,
      start: slot.start_time,
      end: slot.end_time,
      days: Array.isArray(slot.days_json) ? slot.days_json : JSON.parse(slot.days_json),
    };
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
    return {
      id: student.id,
      name: student.name,
      gradeLabel: student.grade_label,
      classLabel: student.class_label,
      phoneMasked: maskPhone(student.phone),
      updatedAtLabel: formatDateLabel(latest),
      selections: rows
        .map((row) => slotMap[row.slot_id])
        .filter(Boolean),
    };
  });

  const appliedStudentCount = studentEntries.filter((student) => student.selections.length > 0).length;
  const selectionCount = studentEntries.reduce((sum, student) => sum + student.selections.length, 0);

  return {
    studentCount: students.length,
    appliedStudentCount,
    selectionCount,
    students: studentEntries,
    missingContacts: getMissingContacts(),
    exportUrl: "/api/admin/export.csv",
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
  formatDateLabel,
};
