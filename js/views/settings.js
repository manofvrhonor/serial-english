import {
  exportToFile,
  importFromFile,
  updateIntervals,
  hardResetState,
} from "../db/database.js";

export function renderSettings(el, ctx) {
  const intervals = ctx.state.settings?.intervals || [1, 3, 7, 16, 30];

  el.innerHTML = `
    <div class="page settings-page">
    <h1 class="view-title view-title-section">Настройки</h1>
    <p class="view-subtitle">Интервалы SRS, экспорт и импорт данных.</p>

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

      <section class="card card-padded settings-card settings-danger">
        <h2 class="settings-heading">HARD RESET</h2>
        <p class="settings-hint">Удалить все слова, выражения, сериалы, книги, прогресс SRS и историю. Стоп-лист будет очищен.</p>
        <button type="button" id="hard-reset-open" class="btn btn-danger">HARD RESET — начать с нуля</button>
      </section>

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
        <div class="modal-actions">
          <button type="button" class="btn secondary" id="hard-reset-cancel">Отмена</button>
          <button type="button" class="btn btn-danger" id="hard-reset-confirm">Удалить всё</button>
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
  const openModal = () => { modal.hidden = false; };
  const closeModal = () => { modal.hidden = true; };

  el.querySelector("#hard-reset-open").addEventListener("click", openModal);
  el.querySelector("#hard-reset-cancel").addEventListener("click", closeModal);
  el.querySelector("#hard-reset-backdrop").addEventListener("click", closeModal);

  el.querySelector("#hard-reset-confirm").addEventListener("click", () => {
    hardResetState(ctx.state);
    ctx.save();
    closeModal();
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
