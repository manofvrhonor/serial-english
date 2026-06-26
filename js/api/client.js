// ===== HTTP-клиент к бэкенду Serial English =====
import {
  getApiBase,
  getToken,
  setToken,
  setEmail,
  deviceLabel,
} from "./config.js";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path) {
  const base = getApiBase();
  if (!base) throw new ApiError("Адрес сервера не задан", 0);
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function request(path, { method = "GET", body = null, auth = false } = {}) {
  const headers = {};
  if (body != null) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(buildUrl(path), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("Не удалось подключиться к серверу. Проверьте адрес и сеть.", 0);
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail : `Ошибка сервера (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

// ---------- Auth ----------
export async function register(email, password) {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: { email, password },
  });
  if (data?.access_token) {
    setToken(data.access_token);
    setEmail(email);
  }
  return data;
}

export async function login(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (data?.access_token) {
    setToken(data.access_token);
    setEmail(email);
  }
  return data;
}

export async function me() {
  return request("/api/auth/me", { auth: true });
}

// ---------- Progress ----------
// Возвращает { data, updated_at, device } или null, если на сервере пусто.
export async function getProgress() {
  return request("/api/progress", { auth: true });
}

export async function putProgress(state, updatedAtIso) {
  return request("/api/progress", {
    method: "PUT",
    auth: true,
    body: { data: state, updated_at: updatedAtIso, device: deviceLabel() },
  });
}

// ---------- Library ----------
export async function serverLibraryIndex() {
  return request("/api/library");
}

export async function serverLibraryShow(id) {
  return request(`/api/library/${encodeURIComponent(id)}`);
}

export async function uploadLibraryShow(id, payload) {
  return request(`/api/library/${encodeURIComponent(id)}`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export { ApiError };
