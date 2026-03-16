const adminState = {
  summary: null,
  loading: true,
  error: "",
  loginError: "",
  search: "",
};

const adminRoot = document.getElementById("adminRoot");
const adminAppliedCount = document.getElementById("adminAppliedCount");
const adminSelectionCount = document.getElementById("adminSelectionCount");

function adminEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function adminFetch(url, options = {}) {
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

function renderAdminLoading() {
  adminRoot.innerHTML = `
    <section class="panel">
      <h2>관리자 화면 불러오는 중</h2>
      <p class="panel-subtext">중앙 서버에서 신청 현황을 가져오고 있습니다.</p>
    </section>
  `;
}

function renderAdminLogin() {
  adminRoot.innerHTML = `
    <section class="panel">
      <h2>관리자 로그인</h2>
      <p class="panel-subtext">기본 비밀번호는 서버 설정값입니다. 운영 전에는 반드시 변경해 주세요.</p>
      <form id="adminLoginForm">
        <div class="login-grid" style="grid-template-columns:minmax(0, 420px);">
          <div class="field">
            <label for="adminPasswordInput">관리자 비밀번호</label>
            <input id="adminPasswordInput" type="password" placeholder="비밀번호 입력" required>
          </div>
        </div>
        <div class="login-actions">
          <button class="btn-primary" type="submit">로그인</button>
          <a class="text-link" href="/index.html">학부모 화면</a>
        </div>
      </form>
      ${adminState.loginError ? `<div class="inline-message error">${adminState.loginError}</div>` : ""}
    </section>
  `;

  document.getElementById("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    adminState.loginError = "";
    try {
      await adminFetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          password: document.getElementById("adminPasswordInput").value,
        }),
      });
      await loadAdminSummary();
    } catch (error) {
      adminState.loginError = error.message;
      renderAdminLogin();
    }
  });
}

function renderMissingContacts(items) {
  if (!items.length) {
    return `<div class="empty-note">연락처 누락 학생이 없습니다.</div>`;
  }
  return `
    <div class="selected-list">
      ${items.map((item) => `<div class="selected-pill"><strong>${adminEscapeHtml(item)}</strong></div>`).join("")}
    </div>
  `;
}

function renderStudentRows() {
  const keyword = adminState.search.trim();
  const filtered = adminState.summary.students.filter((student) => {
    if (!keyword) return true;
    const haystack = [
      student.name,
      student.gradeLabel,
      student.classLabel,
      student.phoneMasked,
      student.selections.map((selection) => `${selection.courseName} ${selection.period}`).join(" "),
    ].join(" ");
    return haystack.includes(keyword);
  });

  if (!filtered.length) {
    return `<tr><td colspan="6" class="admin-empty">검색 결과가 없습니다.</td></tr>`;
  }

  return filtered.map((student) => `
    <tr>
      <td>${adminEscapeHtml(student.gradeLabel)} ${adminEscapeHtml(student.classLabel)}</td>
      <td>${adminEscapeHtml(student.name)}</td>
      <td>${adminEscapeHtml(student.phoneMasked)}</td>
      <td>${student.selections.length}</td>
      <td>${student.selections.map((selection) => `
        <div class="admin-selection-line">
          ${adminEscapeHtml(selection.courseName)} ${adminEscapeHtml(selection.period)} · ${adminEscapeHtml(selection.days.join(", "))} · ${adminEscapeHtml(selection.start)}~${adminEscapeHtml(selection.end)}
        </div>
      `).join("") || '<span class="empty-note">미신청</span>'}</td>
      <td>${adminEscapeHtml(student.updatedAtLabel || "-")}</td>
    </tr>
  `).join("");
}

function renderAdminDashboard() {
  adminAppliedCount.textContent = String(adminState.summary.appliedStudentCount);
  adminSelectionCount.textContent = String(adminState.summary.selectionCount);

  adminRoot.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div class="toolbar-copy">
          <h2>신청 현황</h2>
          <p>학생별 신청 내역과 연락처 누락 학생을 확인할 수 있습니다.</p>
        </div>
        <div class="toolbar-actions">
          <a class="text-link" href="${adminState.summary.exportUrl}">CSV 내려받기</a>
          <button class="btn-secondary" id="adminReloadDataBtn" type="button">원본자료 다시 불러오기</button>
          <button class="btn-secondary" id="adminLogoutBtn" type="button">로그아웃</button>
        </div>
      </div>
      ${adminState.error ? `<div class="inline-message error">${adminState.error}</div>` : ""}
      <div class="summary-matrix">
        <div class="summary-card">
          <h2>요약</h2>
          <div class="summary-meta">
            <div class="summary-item">
              <label>로그인 가능 학생</label>
              <strong>${adminState.summary.studentCount}명</strong>
            </div>
            <div class="summary-item">
              <label>신청 학생</label>
              <strong>${adminState.summary.appliedStudentCount}명</strong>
            </div>
            <div class="summary-item">
              <label>연락처 누락</label>
              <strong>${adminState.summary.missingContacts.length}명</strong>
            </div>
          </div>
        </div>
        <div class="summary-card">
          <h2>연락처 누락 학생</h2>
          ${renderMissingContacts(adminState.summary.missingContacts)}
        </div>
      </div>
      <div class="search-toolbar" style="margin-top:18px;">
        <input id="adminSearchInput" class="search-input" type="search" placeholder="학생명, 연락처, 강좌명 검색" value="${adminEscapeHtml(adminState.search)}">
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>학년반</th>
              <th>이름</th>
              <th>연락처</th>
              <th>신청수</th>
              <th>신청 내역</th>
              <th>저장 시각</th>
            </tr>
          </thead>
          <tbody>
            ${renderStudentRows()}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById("adminSearchInput").addEventListener("input", (event) => {
    adminState.search = event.target.value;
    renderAdminDashboard();
  });

  document.getElementById("adminReloadDataBtn").addEventListener("click", async () => {
    try {
      const payload = await adminFetch("/api/admin/reload", {
        method: "POST",
        body: JSON.stringify({}),
      });
      adminState.error = payload.message;
      await loadAdminSummary();
    } catch (error) {
      adminState.error = error.message;
      renderAdminDashboard();
    }
  });

  document.getElementById("adminLogoutBtn").addEventListener("click", async () => {
    await adminFetch("/api/logout", { method: "POST", body: JSON.stringify({}) });
    adminState.summary = null;
    adminAppliedCount.textContent = "-";
    adminSelectionCount.textContent = "-";
    renderAdminLogin();
  });
}

async function loadAdminSummary() {
  adminState.loading = true;
  renderAdminLoading();
  try {
    adminState.summary = await adminFetch("/api/admin/summary", { method: "GET" });
    adminState.loading = false;
    adminState.error = "";
    renderAdminDashboard();
  } catch (error) {
    adminState.loading = false;
    if (error.message.includes("관리자 로그인")) {
      adminState.summary = null;
      renderAdminLogin();
      return;
    }
    adminState.error = error.message;
    renderAdminLogin();
  }
}

loadAdminSummary();
