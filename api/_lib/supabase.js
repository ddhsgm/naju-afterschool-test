const { URLSearchParams } = require("url");

function getEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }
  return { url, key };
}

async function supabaseRequest(table, options = {}) {
  const { url, key } = getEnv();
  const method = options.method || "GET";
  const params = new URLSearchParams(options.query || {});
  const endpoint = `${url}/rest/v1/${table}${params.toString() ? `?${params.toString()}` : ""}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(endpoint, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = text;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && (payload.message || payload.error_description || payload.hint)) ||
      "Supabase 요청 중 오류가 발생했습니다.";
    throw new Error(message);
  }

  return payload;
}

async function selectRows(table, query = {}) {
  return supabaseRequest(table, { method: "GET", query });
}

async function insertRows(table, rows) {
  return supabaseRequest(table, {
    method: "POST",
    body: rows,
    headers: { Prefer: "return=representation" },
  });
}

async function deleteRows(table, query) {
  return supabaseRequest(table, {
    method: "DELETE",
    query,
    headers: { Prefer: "return=minimal" },
  });
}

module.exports = {
  selectRows,
  insertRows,
  deleteRows,
};
