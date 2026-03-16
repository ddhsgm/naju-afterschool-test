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
      <p class="panel-subtext">관리자 비밀번호를 입력하면 신청 현황과 엑셀 다운로드 화면이 열립니다.</p>
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
      ${adminState.loginError ? `<div class="inline-message error">${adminEscapeHtml(adminState.loginError)}</div>` : ""}
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

function renderSelectionLines(student) {
  if (!student.selections.length) {
    return '<span class="empty-note">미신청</span>';
  }

  return student.selections
    .map(
      (selection) => `
        <div class="admin-selection-line">
          <strong>${adminEscapeHtml(selection.courseName)} ${adminEscapeHtml(selection.period)}</strong>
          <span>${adminEscapeHtml(selection.days.join(", "))} · ${adminEscapeHtml(selection.start)}~${adminEscapeHtml(selection.end)}</span>
          <span>수강료 ${adminEscapeHtml(selection.feeLabel)} / 재료비 ${adminEscapeHtml(selection.materialCostLabel)} / 합계 ${adminEscapeHtml(selection.totalLabel)}</span>
        </div>
      `
    )
    .join("");
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
      student.careLabel,
      student.remark,
      student.selections.map((selection) => `${selection.courseName} ${selection.period}`).join(" "),
    ].join(" ");
    return haystack.includes(keyword);
  });

  if (!filtered.length) {
    return `<tr><td colspan="8" class="admin-empty">검색 결과가 없습니다.</td></tr>`;
  }

  return filtered
    .map(
      (student) => `
        <tr>
          <td>${adminEscapeHtml(student.gradeLabel)} ${adminEscapeHtml(student.classLabel)}</td>
          <td>${adminEscapeHtml(student.name)}</td>
          <td>${adminEscapeHtml(student.phoneMasked)}</td>
          <td>${adminEscapeHtml(student.careLabel || "-")}</td>
          <td>${student.selections.length}</td>
          <td>${renderSelectionLines(student)}</td>
          <td>${adminEscapeHtml(student.costSummary.totalLabel)}</td>
          <td>${adminEscapeHtml(student.updatedAtLabel || "-")}</td>
        </tr>
      `
    )
    .join("");
}

function renderAdminDashboard() {
  adminAppliedCount.textContent = String(adminState.summary.appliedStudentCount);
  adminSelectionCount.textContent = String(adminState.summary.selectionCount);

  adminRoot.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div class="toolbar-copy">
          <h2>신청 현황</h2>
          <p>학부모가 저장한 신청 내역을 보고, 샘플 서식에 맞춘 엑셀을 바로 내려받을 수 있습니다.</p>
        </div>
        <div class="toolbar-actions">
          <a class="text-link" href="${adminState.summary.exportUrl}">엑셀 다운로드</a>
          <button class="btn-secondary" id="adminReloadDataBtn" type="button">원본자료 다시 반영</button>
          <button class="btn-secondary" id="adminLogoutBtn" type="button">로그아웃</button>
        </div>
      </div>
      ${adminState.error ? `<div class="inline-message error">${adminEscapeHtml(adminState.error)}</div>` : ""}
      <div class="summary-matrix">
        <div class="summary-card">
          <h2>기본 현황</h2>
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
              <label>총 선택 건수</label>
              <strong>${adminState.summary.selectionCount}건</strong>
            </div>
            <div class="summary-item">
              <label>연락처 누락</label>
              <strong>${adminState.summary.missingContacts.length}명</strong>
            </div>
          </div>
        </div>
        <div class="summary-card">
          <h2>예상 비용 합계</h2>
          <div class="summary-meta">
            <div class="summary-item">
              <label>수강료 합계</label>
              <strong>${adminEscapeHtml(adminState.summary.totalCostSummary.feeLabel)}</strong>
            </div>
            <div class="summary-item">
              <label>재료비 합계</label>
              <strong>${adminEscapeHtml(adminState.summary.totalCostSummary.materialCostLabel)}</strong>
            </div>
            <div class="summary-item">
              <label>총 부담 합계</label>
              <strong>${adminEscapeHtml(adminState.summary.totalCostSummary.totalLabel)}</strong>
            </div>
          </div>
        </div>
        <div class="summary-card">
          <h2>연락처 누락 학생</h2>
          ${renderMissingContacts(adminState.summary.missingContacts)}
        </div>
      </div>
      <div class="search-toolbar" style="margin-top:18px;">
        <input id="adminSearchInput" class="search-input" type="search" placeholder="학생명, 연락처, 강좌명으로 검색" value="${adminEscapeHtml(adminState.search)}">
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>학년반</th>
              <th>이름</th>
              <th>연락처</th>
              <th>돌봄</th>
              <th>신청 수</th>
              <th>신청 내역</th>
              <th>예상 총부담</th>
              <th>최종 저장</th>
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
