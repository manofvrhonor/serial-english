// ===== Конфигурация подключения к бэкенду (Путь B) =====
// Всё хранится в localStorage, чтобы фронт оставался статикой без сборки.
// Если адрес сервера не задан — приложение работает как раньше (полностью оффлайн).

const KEY_API_BASE = "se_api_base";
const KEY_TOKEN = "se_token";
const KEY_EMAIL = "se_email";
const KEY_SYNCED_AT = "se_synced_at";       // серверный updated_at на момент последней синхронизации
const KEY_USE_SERVER_LIB = "se_use_server_library";

function clean(s) {
  return String(s || "").trim();
}

// Приводим адрес сервера к корректному абсолютному URL.
// Чинит частые ошибки ввода: обратные слэши (http:\host), один слэш после схемы
// (http:/host), отсутствие схемы (host:8000) и хвостовые слэши.
// Без нормализации браузер мог трактовать "http:\localhost:8000" как относительный
// путь и слать запросы на адрес текущей страницы (см. agent-changelog).
export function normalizeApiBase(url) {
  let v = clean(url).replace(/\\/g, "/");
  if (!v) return "";
  if (/^https?:/i.test(v)) {
    v = v.replace(/^(https?:)\/*/i, "$1//");
  } else {
    v = "https://" + v.replace(/^\/+/, "");
  }
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return v.replace(/\/+$/, "");
  }
}

// --- Адрес API ---
export function getApiBase() {
  // нормализуем при чтении — чинит и уже сохранённые «битые» значения
  return normalizeApiBase(localStorage.getItem(KEY_API_BASE));
}
export function setApiBase(url) {
  const v = normalizeApiBase(url);
  if (v) localStorage.setItem(KEY_API_BASE, v);
  else localStorage.removeItem(KEY_API_BASE);
}
export function isApiConfigured() {
  return Boolean(getApiBase());
}

// --- Токен авторизации ---
export function getToken() {
  return clean(localStorage.getItem(KEY_TOKEN));
}
export function setToken(token) {
  if (token) localStorage.setItem(KEY_TOKEN, clean(token));
  else localStorage.removeItem(KEY_TOKEN);
}
export function isLoggedIn() {
  return Boolean(getToken());
}

// --- Email текущего пользователя (для отображения) ---
export function getEmail() {
  return clean(localStorage.getItem(KEY_EMAIL));
}
export function setEmail(email) {
  if (email) localStorage.setItem(KEY_EMAIL, clean(email));
  else localStorage.removeItem(KEY_EMAIL);
}

// --- Метка последней синхронизации (серверный updated_at) ---
export function getSyncedAt() {
  return clean(localStorage.getItem(KEY_SYNCED_AT));
}
export function setSyncedAt(iso) {
  if (iso) localStorage.setItem(KEY_SYNCED_AT, clean(iso));
  else localStorage.removeItem(KEY_SYNCED_AT);
}

// --- Брать ли библиотеку сериалов с сервера ---
export function isServerLibraryEnabled() {
  return isApiConfigured() && localStorage.getItem(KEY_USE_SERVER_LIB) === "1";
}
export function setServerLibraryEnabled(on) {
  if (on) localStorage.setItem(KEY_USE_SERVER_LIB, "1");
  else localStorage.removeItem(KEY_USE_SERVER_LIB);
}

// --- Выход: чистим токен и метки синхронизации ---
export function clearSession() {
  setToken("");
  setEmail("");
  setSyncedAt("");
}

// Метка устройства для поля device на сервере (необязательная).
export function deviceLabel() {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Web";
}
