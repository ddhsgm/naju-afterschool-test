const COLORS = [
  ["#166534", "#34d399"],
  ["#7c2d12", "#fb923c"],
  ["#1d4ed8", "#60a5fa"],
  ["#7e22ce", "#c084fc"],
  ["#9a3412", "#fdba74"],
  ["#0f766e", "#5eead4"],
  ["#be123c", "#fb7185"],
  ["#374151", "#9ca3af"],
];

const state = {
  bootstrap: null,
  student: null,
  savedSelections: [],
  draftSelections: [],
  flash: "",
  flashType: "",
  loginError: "",
  search: "",
  loading: true,
  bootstrapError: "",
};

const root = document.getElementById("appRoot");
const studentCount = document.getElementById("studentCount");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhone(phone) {
  const digits = normalizeDigits(phone);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function setFlash(message, type) {
  state.flash = message;
  state.flashType = type;
}

function clearFlash() {
  state.flash = "";
  state.flashType = "";
}

function buildColorMap(courses) {
  const map = {};
  courses.forEach((course, index) => {
    map[course.id] = COLORS[index % COLORS.length];
  });
  return map;
}

function intersects(daysA, daysB) {
  return daysA.some((day) => daysB.includes(day));
}

function hasConflict(baseSlot, compareSlot) {
  return baseSlot.period === compareSlot.period && intersects(baseSlot.days, compareSlot.days);
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.error ? payload.error : "요청 처리 중 오류가 발생했습니다.";
    throw new Error(message);
  }

  return payload;
}

function getSlotDetail(slotId) {
  if (!state.bootstrap) return null;
  for (const course of state.bootstrap.courses) {
    const slot = course.slots.find((item) => item.id === slotId);
    if (slot) {
      return { course, slot };
    }
  }
  return null;
}

function getSelectionsDetail(slotIds) {
  return slotIds.map(getSlotDetail).filter(Boolean);
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
    return { min: 0, max: 0 };
  }

  const values = parseMoneyValues(text);
  if (!values.length) {
    return { min: 0, max: 0 };
  }

  if (text.includes("~") && values.length >= 2) {
    if (values.length === 2) {
      return { min: values[0], max: values[1] };
    }
    return {
      min: values[0] + values[1],
      max: values[0] + values[2],
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return { min: total, max: total };
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

function buildDraftCostSummary() {
  const summary = getSelectionsDetail(state.draftSelections).reduce(
    (acc, { course }) => {
      const feeAmount = parseFeeAmount(course.fee);
      const material = parseMaterialEstimate(course.note);
      acc.feeAmount += feeAmount;
      acc.materialMin += material.min;
      acc.materialMax += material.max;
      acc.totalMin += feeAmount + material.min;
      acc.totalMax += feeAmount + material.max;
      return acc;
    },
    {
      feeAmount: 0,
      materialMin: 0,
      materialMax: 0,
      totalMin: 0,
      totalMax: 0,
    }
  );

  return {
    feeLabel: formatMoney(summary.feeAmount),
    materialLabel: formatMoneyRange(summary.materialMin, summary.materialMax),
    totalLabel: formatMoneyRange(summary.totalMin, summary.totalMax),
  };
}

function getConflictingSelection(slotId, selections) {
  const candidate = getSlotDetail(slotId);
  if (!candidate) return null;
  return getSelectionsDetail(selections).find((entry) => {
    if (entry.slot.id === slotId) return false;
    return hasConflict(entry.slot, candidate.slot);
  }) || null;
}

function isEligible(student, slot) {
  return student.grade >= slot.gradeMin && student.grade <= slot.gradeMax;
}

function upsertSelection(slotId) {
  if (!state.student) return;
  const target = getSlotDetail(slotId);
  if (!target) return;

  const current = [...state.draftSelections];
  const sameCourseSelections = current.filter((id) => getSlotDetail(id)?.course.id === target.course.id);
  const withoutSameCourse = current.filter((id) => !sameCourseSelections.includes(id));
  const conflict = getConflictingSelection(slotId, withoutSameCourse);

  if (conflict) {
    setFlash(`${conflict.course.name} ${conflict.slot.period}와 시간이 겹쳐 선택할 수 없습니다.`, "error");
    render();
    return;
  }

  if (current.includes(slotId)) {
    state.draftSelections = current.filter((id) => id !== slotId);
    clearFlash();
    render();
    return;
  }

  state.draftSelections = [...withoutSameCourse, slotId];
  clearFlash();
  render();
}

async function saveCurrentSelections() {
  try {
    const payload = await apiFetch("/api/applications", {
      method: "POST",
      body: JSON.stringify({ selections: state.draftSelections }),
    });
    state.savedSelections = payload.selections || [];
    state.draftSelections = [...state.savedSelections];
    state.student.updatedAtLabel = payload.updatedAtLabel || state.student.updatedAtLabel;
    setFlash("신청 내용이 중앙 서버에 저장되었습니다.", "success");
    render();
  } catch (error) {
    setFlash(error.message, "error");
    render();
  }
}

function clearSelections() {
  state.draftSelections = [];
  clearFlash();
  render();
}

async function cancelSavedSelections() {
  try {
    const payload = await apiFetch("/api/applications/cancel", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.savedSelections = payload?.selections || [];
    state.draftSelections = [];
    state.student.updatedAtLabel = payload?.updatedAtLabel || "";
    setFlash("저장된 신청 내역을 모두 취소했습니다.", "success");
    render();
  } catch (error) {
    setFlash(error.message, "error");
    render();
  }
}

async function logout() {
  await apiFetch("/api/logout", { method: "POST", body: JSON.stringify({}) });
  state.student = null;
  state.savedSelections = [];
  state.draftSelections = [];
  state.loginError = "";
  state.search = "";
  clearFlash();
  render();
}

function getGradeOptions() {
  const maxGrade = state.bootstrap?.meta?.maxGrade || 6;
  return Array.from({ length: maxGrade }, (_, index) => index + 1);
}

function getClassOptions() {
  const maxClass = state.bootstrap?.meta?.maxClass || 6;
  return Array.from({ length: maxClass }, (_, index) => index + 1);
}

function renderLoading() {
  root.innerHTML = `
    <section class="panel">
      <h2>서버 연결 중</h2>
      <p class="panel-subtext">중앙 저장소와 강좌 정보를 불러오고 있습니다.</p>
    </section>
  `;
}

function renderBootstrapError() {
  root.innerHTML = `
    <section class="panel">
      <h2>서버 연결 실패</h2>
      <p class="panel-subtext">${escapeHtml(state.bootstrapError)}</p>
      <div class="login-actions">
        <button class="btn-primary" type="button" id="retryBootstrapBtn">다시 시도</button>
      </div>
    </section>
  `;
  document.getElementById("retryBootstrapBtn").addEventListener("click", initializeApp);
}

function renderLogin() {
  const gradeOptions = getGradeOptions()
    .map((grade) => `<option value="${grade}">${grade}학년</option>`)
    .join("");
  const classOptions = getClassOptions()
    .map((classRoom) => `<option value="${classRoom}">${classRoom}반</option>`)
    .join("");

  root.innerHTML = `
    <section class="panel">
      <h2>학부모 로그인</h2>
      <p class="panel-subtext">
        학년, 반, 이름을 기준으로 학생을 찾고 대표 연락처로 본인 여부를 확인합니다.
        저장하면 결과가 중앙 서버에 기록되어 관리자 화면에서 바로 확인할 수 있습니다.
      </p>
      <form id="loginForm">
        <div class="login-grid">
          <div class="field">
            <label for="gradeInput">학년</label>
            <select id="gradeInput" required>
              <option value="">선택</option>
              ${gradeOptions}
            </select>
          </div>
          <div class="field">
            <label for="classInput">반</label>
            <select id="classInput" required>
              <option value="">선택</option>
              ${classOptions}
            </select>
          </div>
          <div class="field">
            <label for="nameInput">학생 이름</label>
            <input id="nameInput" type="text" placeholder="예: 김민서" required>
          </div>
          <div class="field">
            <label for="phoneInput">대표 연락처</label>
            <input id="phoneInput" type="tel" placeholder="숫자만 입력" required>
          </div>
        </div>
        <div class="login-actions">
          <button class="btn-primary" type="submit">로그인</button>
          <a class="text-link" href="/admin.html">관리자 화면</a>
        </div>
      </form>
      ${state.loginError ? `<div class="inline-message error">${state.loginError}</div>` : ""}
    </section>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const grade = Number(document.getElementById("gradeInput").value);
    const classRoom = Number(document.getElementById("classInput").value);
    const name = document.getElementById("nameInput").value.trim();
    const phone = document.getElementById("phoneInput").value;
    state.loginError = "";
    clearFlash();
    render();

    try {
      const payload = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({
          grade,
          classRoom,
          name,
          phone,
        }),
      });
      state.student = payload.student;
      state.savedSelections = payload.selections || [];
      state.draftSelections = [...state.savedSelections];
      render();
    } catch (error) {
      state.loginError = error.message;
      render();
    }
  });
}

function createSelectedSummary() {
  const details = getSelectionsDetail(state.draftSelections);
  if (!details.length) {
    return `<div class="empty-note">아직 선택한 강좌가 없습니다. 오른쪽 강좌 목록에서 원하는 시간을 눌러 주세요.</div>`;
  }

  const costSummary = buildDraftCostSummary();

  return `
    <div class="selected-list">
      ${details
        .map(({ course, slot }) => `
          <div class="selected-pill">
            <strong>${course.name} ${slot.period}</strong>
            <span>${slot.days.join(", ")} · ${slot.start}~${slot.end} · ${slot.room || course.room || "-"}</span>
          </div>
        `)
        .join("")}
    </div>
    <div class="summary-meta" style="margin-top:14px;">
      <div class="summary-item">
        <label>예상 수강료</label>
        <strong>${costSummary.feeLabel}</strong>
      </div>
      <div class="summary-item">
        <label>예상 재료비</label>
        <strong>${costSummary.materialLabel}</strong>
      </div>
      <div class="summary-item">
        <label>예상 총부담</label>
        <strong>${costSummary.totalLabel}</strong>
      </div>
    </div>
  `;
}

function renderSummaryCard() {
  const supportNotes = [
    state.student.careLabel ? `돌봄 ${state.student.careLabel}` : "",
    state.student.isFreePassEligible ? `자유수강권 대상${state.student.freePassInfo?.supportTotal ? ` · 작년 지원액 ${formatMoney(state.student.freePassInfo.supportTotal)}` : ""}` : "",
    state.student.isVoucherEligible ? "3학년 바우처 대상" : "",
  ].filter(Boolean);

  return `
    <section class="summary-card">
      <h2>${state.student.name}</h2>
      <p class="panel-subtext">
        ${state.student.gradeLabel} ${state.student.classLabel} · 대표 연락처 ${formatPhone(state.student.phoneMasked)}
        ${supportNotes.length ? `<br>${supportNotes.join(" · ")}` : ""}
      </p>
      <div class="summary-meta">
        <div class="summary-item">
          <label>현재 선택</label>
          <strong>${state.draftSelections.length}개 강좌</strong>
        </div>
        <div class="summary-item">
          <label>마지막 저장</label>
          <strong>${state.student.updatedAtLabel || "저장 전"}</strong>
        </div>
        <div class="summary-item">
          <label>안내</label>
          <strong>시간이 겹치면 자동 차단</strong>
        </div>
      </div>
      ${createSelectedSummary()}
      <div class="selection-actions" style="margin-top:18px;">
        <button class="btn-primary" id="saveBtn" type="button">신청 저장</button>
        <button class="btn-secondary" id="clearDraftBtn" type="button">선택만 비우기</button>
        <button class="btn-danger" id="cancelSavedBtn" type="button">저장된 신청 취소</button>
      </div>
      <p class="save-note" style="margin:14px 0 0;">현재 저장은 이 컴퓨터 안이 아니라 서버에 모입니다. 관리자 화면에서 전체 현황을 바로 볼 수 있습니다.</p>
      ${state.flash ? `<div class="inline-message ${state.flashType}">${state.flash}</div>` : ""}
    </section>
  `;
}

function buildTimetableMap() {
  const map = {};
  getSelectionsDetail(state.draftSelections).forEach(({ course, slot }) => {
    slot.days.forEach((day) => {
      map[`${day}-${slot.period}`] = { course, slot };
    });
  });
  return map;
}

function renderTimetableCard() {
  const timetableMap = buildTimetableMap();
  const rows = Object.entries(state.bootstrap.meta.periods)
    .map(([period, timeInfo]) => {
      const dayCells = state.bootstrap.meta.days
        .map((day) => {
          const entry = timetableMap[`${day}-${period}`];
          if (!entry) {
            return `<td class="timetable-cell"></td>`;
          }
          const [bg, accent] = buildColorMap(state.bootstrap.courses)[entry.course.id];
          return `
            <td class="timetable-cell">
              <div class="timetable-entry" style="background:linear-gradient(180deg, ${bg}, ${accent});">
                <strong>${entry.course.name}</strong>
                <span>${entry.slot.room || entry.course.room || "-"}</span>
                <span>${entry.slot.start}~${entry.slot.end}</span>
              </div>
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <td class="timetable-label">
            <strong>${period}</strong>
            <span>${timeInfo.start}~${timeInfo.end}</span>
          </td>
          ${dayCells}
        </tr>
      `;
    })
    .join("");

  return `
    <section class="timetable-card">
      <h2>선택 시간표</h2>
      <p class="panel-subtext">강좌를 고르면 주간 시간표에 즉시 반영됩니다.</p>
      <div class="timetable-scroll">
        <table class="timetable-table">
          <thead>
            <tr>
              <th></th>
              ${state.bootstrap.meta.days.map((day) => `<th>${day}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function buildStatus(student, course, slot, draftSelections) {
  if (!isEligible(student, slot)) {
    return { label: `${slot.gradeMin}~${slot.gradeMax}학년 대상`, type: "blocked", disabled: true };
  }

  if (draftSelections.includes(slot.id)) {
    return { label: "선택됨", type: "selected", disabled: false };
  }

  const conflict = getConflictingSelection(
    slot.id,
    draftSelections.filter((id) => getSlotDetail(id)?.course.id !== course.id)
  );
  if (conflict) {
    return { label: `${conflict.course.name} ${conflict.slot.period}와 겹침`, type: "blocked", disabled: true };
  }

  return { label: "선택 가능", type: "open", disabled: false };
}

function renderCourseCards() {
  const keyword = state.search.trim();
  const filteredCourses = state.bootstrap.courses.filter((course) => {
    if (!keyword) return true;
    return course.name.includes(keyword) || course.days.join("").includes(keyword);
  });

  if (!filteredCourses.length) {
    return `<div class="empty-state">검색 결과가 없습니다. 과목 이름이나 요일로 다시 찾아보세요.</div>`;
  }

  return filteredCourses
    .map((course) => {
      const slots = course.slots.map((slot) => {
        const status = buildStatus(state.student, course, slot, state.draftSelections);
        const isSelected = status.type === "selected";
        const classNames = ["slot-button", isSelected ? "selected" : "", status.disabled && !isSelected ? "blocked" : ""]
          .filter(Boolean)
          .join(" ");
        const roomLabel = slot.room || course.room || "-";

        return `
          <button
            class="${classNames}"
            type="button"
            data-slot-id="${slot.id}"
            ${status.disabled && !isSelected ? "disabled" : ""}
          >
            <div class="slot-top">
              <span class="slot-title">${slot.period} · ${slot.start}~${slot.end}</span>
              <span class="status-chip ${status.type}">${status.label}</span>
            </div>
            <div class="slot-meta">
              ${slot.days.join(", ")} · ${slot.gradeMin}~${slot.gradeMax}학년 · ${roomLabel}
            </div>
          </button>
        `;
      }).join("");

      return `
        <article class="course-card">
          <div class="course-head">
            <div class="course-title">
              <h3>${course.name}</h3>
              <p>${course.note || "안내문 기준 운영"}</p>
            </div>
            <div class="course-badge">정원 ${course.capacity}명</div>
          </div>
          <div class="course-meta">
            <span>${course.days.join(", ")}</span>
            <span>${course.room || "-"}</span>
            <span>${course.teacher}</span>
            <span>${course.fee}</span>
          </div>
          <div class="slot-list">${slots}</div>
        </article>
      `;
    })
    .join("");
}

function renderDashboard() {
  root.innerHTML = `
    <div class="dashboard-grid">
      <aside class="sidebar-stack">
        ${renderSummaryCard()}
      </aside>
      <section class="panel">
        ${renderTimetableCard()}
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>강좌 선택</h2>
            <p>같은 요일 같은 부 시간이 겹치면 자동으로 비활성화됩니다. 다른 시간대로 바꾸면 같은 과목 안에서 교체됩니다.</p>
          </div>
          <div class="toolbar-actions">
            <a class="text-link" href="/admin.html">관리자 화면</a>
            <button class="btn-secondary" id="logoutBtn" type="button">로그아웃</button>
          </div>
        </div>
        <div class="search-toolbar">
          <input id="courseSearch" class="search-input" type="search" placeholder="과목명 또는 요일로 검색" value="${escapeHtml(state.search)}">
        </div>
        <div class="course-grid">
          ${renderCourseCards()}
        </div>
      </section>
    </div>
  `;

  document.getElementById("saveBtn").addEventListener("click", saveCurrentSelections);
  document.getElementById("clearDraftBtn").addEventListener("click", clearSelections);
  document.getElementById("cancelSavedBtn").addEventListener("click", cancelSavedSelections);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("courseSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  root.querySelectorAll("[data-slot-id]").forEach((button) => {
    button.addEventListener("click", () => upsertSelection(button.dataset.slotId));
  });
}

function render() {
  if (state.loading) {
    renderLoading();
    return;
  }
  if (state.bootstrapError) {
    renderBootstrapError();
    return;
  }
  studentCount.textContent = String(state.bootstrap.meta.studentCount);
  if (!state.student) {
    renderLogin();
    return;
  }
  renderDashboard();
}

async function restoreSession() {
  try {
    const payload = await apiFetch("/api/me", { method: "GET" });
    if (payload?.student) {
      state.student = payload.student;
      state.savedSelections = payload.selections || [];
      state.draftSelections = [...state.savedSelections];
    }
  } catch (error) {
    state.student = null;
  }
}

async function initializeApp() {
  state.loading = true;
  state.bootstrapError = "";
  render();

  try {
    state.bootstrap = await apiFetch("/api/bootstrap", { method: "GET", headers: {} });
    await restoreSession();
  } catch (error) {
    state.bootstrapError = error.message || "서버에 연결하지 못했습니다.";
  } finally {
    state.loading = false;
    render();
  }
}

initializeApp();
