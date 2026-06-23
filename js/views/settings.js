import {
  exportToFile,
  importFromFile,
  updateIntervals,
  hardResetState,
} from "../db/database.js";
import { isAdminMode, setAdminMode, verifyAdminPassword } from "../core/admin-gate.js";

export function renderSettings(el, ctx) {
  const intervals = ctx.state.settings?.intervals || [1, 3, 7, 16, 30];

  el.innerHTML = `
    <div class="page settings-page">
    <h1 class="view-title view-title-section">Настройки</h1>

    <div class="settings-stack">

      <section class="card card-padded settings-card">
        <h2 class="settings-heading">Интервалы SRS (дней)</h2>
        <p class="settings-hint">Для уровней 1–5 после сбора всех галочек в направлении.</p>
        <div class="intervals-row">
          ${intervals.map((n, i) => `
            <label>Ур.${i + 1}
              <input type="number" class="interval-input" data-i="${i}" value="${n}" min="1" max="365" />
            </label>`).join("")}
        </div>
        <button id="save-intervals" class="btn btn-sm">Сохранить интервалы</button>
      </section>

      <section class="card card-padded settings-card">
        <h2 class="settings-heading">Данные</h2>
        <p class="settings-hint">Экспорт и импорт всей базы в .json.</p>
        <div class="row">
          <button class="btn" id="exportBtn">Экспорт .json</button>
          <label class="btn secondary" style="display:inline-block;cursor:pointer;">
            Импорт .json
            <input type="file" id="importInput" accept=".json" hidden />
          </label>
        </div>
        <p id="settingsMsg" class="settings-msg"></p>
      </section>

      <section class="card card-padded settings-card">
        <h2 class="settings-heading">Админ-режим</h2>
        <p class="settings-hint">Инструмент авторинга библиотеки сериалов. Не криптозащита — только скрытие раздела.</p>
        <label class="admin-toggle-row">
          <input type="checkbox" id="admin-toggle" ${isAdminMode() ? "checked" : ""} />
          <span>Включить админ-режим</span>
        </label>
        <div id="admin-actions" ${isAdminMode() ? "" : "hidden"}>
          <button type="button" class="btn" id="admin-library-btn">Открыть админ-библиотеку</button>
        </div>
        <p id="adminMsg" class="settings-msg"></p>
      </section>

      <section class="card card-padded settings-card settings-danger">
        <h2 class="settings-heading">HARD RESET</h2>
        <p class="settings-hint">Удалить все слова, выражения, сериалы, книги, прогресс SRS и историю. Стоп-лист будет очищен.</p>
        <button type="button" id="hard-reset-open" class="btn btn-danger">HARD RESET — начать с нуля</button>
      </section>

    </div>

    <div class="modal" id="admin-password-modal" hidden>
      <div class="modal-backdrop" id="admin-password-backdrop"></div>
      <div class="modal-card card card-padded" role="dialog" aria-labelledby="admin-password-title">
        <h2 class="settings-heading" id="admin-password-title">Пароль администратора</h2>
        <label class="field-label field-full">
          <span>Пароль</span>
          <input type="password" id="admin-password-input" autocomplete="off" inputmode="numeric" />
        </label>
        <p id="admin-password-err" class="settings-msg settings-msg-err" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn secondary" id="admin-password-cancel">Отмена</button>
          <button type="button" class="btn" id="admin-password-confirm">Войти</button>
        </div>
      </div>
    </div>

    <div class="modal" id="hard-reset-modal" hidden>
      <div class="modal-backdrop" id="hard-reset-backdrop"></div>
      <div class="modal-card card card-padded modal-card-danger" role="alertdialog" aria-labelledby="hard-reset-title">
        <h2 class="settings-heading" id="hard-reset-title">⚠️ HARD RESET</h2>
        <p class="modal-warning">
          Это действие <strong>необратимо</strong>. Будут удалены:
        </p>
        <ul class="modal-warning-list">
          <li>все слова и выражения</li>
          <li>сериалы, книги и источники</li>
          <li>прогресс SRS и история тренировок</li>
          <li>стоп-лист (очистится)</li>
        </ul>
        <p class="modal-warning">Сохраните экспорт .json, если хотите восстановить данные позже.</p>
        <div class="modal-actions modal-actions-stack">
          <button type="button" class="btn btn-dark btn-block" id="hard-reset-cancel">Отмена</button>
          <button type="button" class="btn btn-danger btn-block" id="hard-reset-confirm">Удалить всё</button>
        </div>
      </div>
    </div>

    <div class="modal" id="hard-reset-final-modal" hidden>
      <div class="modal-backdrop" id="hard-reset-final-backdrop"></div>
      <div class="modal-card card card-padded modal-card-danger" role="alertdialog" aria-labelledby="hard-reset-final-title">
        <h2 class="settings-heading" id="hard-reset-final-title">ВЫ ТОЧНО ХОТИТЕ ВСЁ УДАЛИТЬ?</h2>
        <div class="modal-actions modal-actions-stack">
          <button type="button" class="btn btn-dark btn-block" id="hard-reset-final-no">Нет</button>
          <button type="button" class="btn btn-danger btn-block" id="hard-reset-final-yes">Да</button>
        </div>
      </div>
    </div>
    </div>
  `;

  el.querySelector("#save-intervals").addEventListener("click", () => {
    const vals = [...el.querySelectorAll(".interval-input")].map((inp) => inp.value);
    updateIntervals(ctx.state, vals);
    ctx.save();
    flash(el, "Интервалы сохранены ✔");
  });

  el.querySelector("#exportBtn").addEventListener("click", async () => {
    await exportToFile();
    flash(el, "Файл выгружен ✔");
  });

  el.querySelector("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importFromFile(file);
      await ctx.reload();
      renderSettings(el, ctx);
      flash(el, "Данные импортированы ✔");
    } catch {
      flash(el, "Ошибка: файл повреждён или не .json", true);
    }
    e.target.value = "";
  });

  const modal = el.querySelector("#hard-reset-modal");
  const finalModal = el.querySelector("#hard-reset-final-modal");
  const openModal = () => { modal.hidden = false; };
  const closeModal = () => { modal.hidden = true; };
  const openFinalModal = () => { finalModal.hidden = false; };
  const closeFinalModal = () => { finalModal.hidden = true; };

  const adminToggle = el.querySelector("#admin-toggle");
  const adminActions = el.querySelector("#admin-actions");
  const adminPwdModal = el.querySelector("#admin-password-modal");
  const adminPwdInput = el.querySelector("#admin-password-input");
  const adminPwdErr = el.querySelector("#admin-password-err");

  const closeAdminPwdModal = () => {
    adminPwdModal.hidden = true;
    adminPwdInput.value = "";
    adminPwdErr.hidden = true;
    adminPwdErr.textContent = "";
  };

  const openAdminPwdModal = () => {
    adminPwdModal.hidden = false;
    adminPwdErr.hidden = true;
    adminPwdErr.textContent = "";
    requestAnimationFrame(() => adminPwdInput.focus());
  };

  adminToggle.addEventListener("change", () => {
    if (adminToggle.checked) {
      if (isAdminMode()) {
        adminActions.hidden = false;
        return;
      }
      adminToggle.checked = false;
      openAdminPwdModal();
      return;
    }
    setAdminMode(false);
    adminActions.hidden = true;
    flashAdmin(el, "Админ-режим выключен");
  });

  el.querySelector("#admin-password-cancel").addEventListener("click", closeAdminPwdModal);
  el.querySelector("#admin-password-backdrop").addEventListener("click", closeAdminPwdModal);

  const submitAdminPassword = () => {
    if (!verifyAdminPassword(adminPwdInput.value)) {
      adminPwdErr.textContent = "Неверный пароль";
      adminPwdErr.hidden = false;
      adminPwdInput.focus();
      adminPwdInput.select();
      return;
    }
    setAdminMode(true);
    adminToggle.checked = true;
    adminActions.hidden = false;
    closeAdminPwdModal();
    flashAdmin(el, "Админ-режим включён");
  };

  el.querySelector("#admin-password-confirm").addEventListener("click", submitAdminPassword);
  adminPwdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAdminPassword();
    if (e.key === "Escape") closeAdminPwdModal();
  });

  el.querySelector("#admin-library-btn").addEventListener("click", () => {
    ctx.navigateTo("library-admin");
  });

  el.querySelector("#hard-reset-open").addEventListener("click", openModal);
  el.querySelector("#hard-reset-cancel").addEventListener("click", closeModal);
  el.querySelector("#hard-reset-backdrop").addEventListener("click", closeModal);

  el.querySelector("#hard-reset-confirm").addEventListener("click", () => {
    closeModal();
    openFinalModal();
  });

  el.querySelector("#hard-reset-final-no").addEventListener("click", closeFinalModal);
  el.querySelector("#hard-reset-final-backdrop").addEventListener("click", closeFinalModal);

  el.querySelector("#hard-reset-final-yes").addEventListener("click", () => {
    hardResetState(ctx.state);
    ctx.save();
    closeFinalModal();
    renderSettings(el, ctx);
    flash(el, "Данные полностью сброшены");
  });
}

function flash(el, text, isError = false) {
  const msg = el.querySelector("#settingsMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = `settings-msg ${isError ? "settings-msg-err" : "settings-msg-ok"}`;
}

function flashAdmin(el, text, isError = false) {
  const msg = el.querySelector("#adminMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = `settings-msg ${isError ? "settings-msg-err" : "settings-msg-ok"}`;
}
