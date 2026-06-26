// ===== Секция «Аккаунт и синхронизация» в Настройках (Путь B) =====
// Полностью изолирована: рендерит и управляет только контейнером #account-section.
// Если адрес сервера не задан — приложение остаётся оффлайн, ничего не меняется.

import {
  getApiBase,
  setApiBase,
  isApiConfigured,
  isLoggedIn,
  getEmail,
  getSyncedAt,
  clearSession,
  isServerLibraryEnabled,
  setServerLibraryEnabled,
} from "../api/config.js";
import * as api from "../api/client.js";
import { smartSync, pushToServer, pullFromServer } from "../sync/sync.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtSynced() {
  const v = getSyncedAt();
  if (!v) return "ещё не синхронизировано";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : `последняя синхронизация: ${d.toLocaleString("ru-RU")}`;
}

function sectionHtml() {
  const base = getApiBase();
  const serverRow = `
    <details class="account-server" ${isApiConfigured() ? "" : "open"}>
      <summary class="settings-hint">Адрес сервера${base ? `: <code>${esc(base)}</code>` : " (не задан — приложение работает оффлайн)"}</summary>
      <div class="row" style="margin-top:.5rem;">
        <input type="url" id="api-base-input" class="field-input" placeholder="https://api.example.ru"
          value="${esc(base)}" style="flex:1;min-width:0;" />
        <button type="button" class="btn btn-sm" id="api-base-save">Сохранить</button>
      </div>
    </details>`;

  if (!isApiConfigured()) {
    return `
      <h2 class="settings-heading">Аккаунт и синхронизация</h2>
      <p class="settings-hint">Войдите, чтобы синхронизировать прогресс между устройствами. Сначала задайте адрес сервера.</p>
      ${serverRow}
      <p id="accountMsg" class="settings-msg"></p>`;
  }

  if (!isLoggedIn()) {
    return `
      <h2 class="settings-heading">Аккаунт и синхронизация</h2>
      <p class="settings-hint">Войдите или зарегистрируйтесь, чтобы хранить прогресс в облаке.</p>
      <div class="account-form">
        <label class="field-label field-full"><span>Email</span>
          <input type="email" id="acc-email" autocomplete="username" /></label>
        <label class="field-label field-full"><span>Пароль</span>
          <input type="password" id="acc-pass" autocomplete="current-password" /></label>
        <div class="row">
          <button type="button" class="btn" id="acc-login">Войти</button>
          <button type="button" class="btn secondary" id="acc-register">Регистрация</button>
        </div>
      </div>
      ${serverRow}
      <p id="accountMsg" class="settings-msg"></p>`;
  }

  return `
    <h2 class="settings-heading">Аккаунт и синхронизация</h2>
    <p class="settings-hint">Вы вошли как <strong>${esc(getEmail() || "пользователь")}</strong>. <span class="account-synced">${esc(fmtSynced())}</span></p>
    <div class="row">
      <button type="button" class="btn" id="acc-sync">Синхронизировать</button>
      <button type="button" class="btn secondary" id="acc-push">Выгрузить на сервер</button>
      <button type="button" class="btn secondary" id="acc-pull">Загрузить с сервера</button>
    </div>
    <label class="admin-toggle-row" style="margin-top:.75rem;">
      <input type="checkbox" id="acc-server-lib" ${isServerLibraryEnabled() ? "checked" : ""} />
      <span>Брать библиотеку сериалов с сервера</span>
    </label>
    <div class="row" style="margin-top:.5rem;">
      <button type="button" class="btn btn-dark btn-sm" id="acc-logout">Выйти</button>
    </div>
    ${serverRow}
    <p id="accountMsg" class="settings-msg"></p>`;
}

export function renderAccountSection(el, ctx) {
  const root = el.querySelector("#account-section");
  if (!root) return;
  root.innerHTML = sectionHtml();

  const rerender = () => renderAccountSection(el, ctx);
  const msg = (text, isError = false) => {
    const m = root.querySelector("#accountMsg");
    if (!m) return;
    m.textContent = text;
    m.className = `settings-msg ${isError ? "settings-msg-err" : "settings-msg-ok"}`;
  };
  const busy = (btn, on, label) => {
    if (!btn) return;
    btn.disabled = on;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || "…";
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
  };

  // --- Адрес сервера ---
  root.querySelector("#api-base-save")?.addEventListener("click", () => {
    const val = root.querySelector("#api-base-input")?.value || "";
    setApiBase(val);
    msg(val ? "Адрес сервера сохранён ✔" : "Адрес сервера очищен");
    rerender();
  });

  // --- Логин / регистрация ---
  const doAuth = async (mode) => {
    const email = root.querySelector("#acc-email")?.value?.trim();
    const pass = root.querySelector("#acc-pass")?.value || "";
    if (!email || !pass) { msg("Введите email и пароль", true); return; }
    const btn = root.querySelector(mode === "login" ? "#acc-login" : "#acc-register");
    busy(btn, true, "…");
    try {
      if (mode === "login") await api.login(email, pass);
      else await api.register(email, pass);
      rerender();
      // После входа предлагаем сразу подтянуть данные.
      try {
        const r = await smartSync(ctx);
        msg(r.action === "pulled" ? "Вход выполнен, данные загружены с сервера ✔" : "Вход выполнен, данные синхронизированы ✔");
      } catch {
        msg("Вход выполнен ✔");
      }
    } catch (err) {
      busy(btn, false);
      msg(err?.message || "Ошибка авторизации", true);
    }
  };
  root.querySelector("#acc-login")?.addEventListener("click", () => doAuth("login"));
  root.querySelector("#acc-register")?.addEventListener("click", () => doAuth("register"));

  // --- Синхронизация ---
  const runSync = async (fn, okText, btnSel) => {
    const btn = root.querySelector(btnSel);
    busy(btn, true, "…");
    try {
      const r = await fn(ctx);
      busy(btn, false);
      if (r?.action === "empty") {
        msg("На сервере пока нет данных — выгрузите локальные.", false);
      } else {
        msg(okText);
      }
      rerender();
    } catch (err) {
      busy(btn, false);
      if (err?.status === 401) {
        clearSession();
        rerender();
        msg("Сессия истекла, войдите снова", true);
      } else {
        msg(err?.message || "Ошибка синхронизации", true);
      }
    }
  };
  root.querySelector("#acc-sync")?.addEventListener("click", () => runSync(smartSync, "Синхронизировано ✔", "#acc-sync"));
  root.querySelector("#acc-push")?.addEventListener("click", () => runSync(pushToServer, "Выгружено на сервер ✔", "#acc-push"));
  root.querySelector("#acc-pull")?.addEventListener("click", () => runSync(pullFromServer, "Загружено с сервера ✔", "#acc-pull"));

  // --- Серверная библиотека ---
  root.querySelector("#acc-server-lib")?.addEventListener("change", (e) => {
    setServerLibraryEnabled(e.target.checked);
    msg(e.target.checked ? "Библиотека будет загружаться с сервера ✔" : "Библиотека — из локальных файлов");
  });

  // --- Выход ---
  root.querySelector("#acc-logout")?.addEventListener("click", () => {
    clearSession();
    rerender();
    msg("Вы вышли из аккаунта");
  });
}
