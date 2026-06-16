import {
  exportToFile,
  importFromFile,
  updateIntervals,
  addStopWord,
  removeStopWord,
  getAppStats,
  hardResetState,
} from "../db/database.js";
import { countDue } from "../core/srs.js";

export function renderSettings(el, ctx) {
  const intervals = ctx.state.settings?.intervals || [1, 3, 7, 16, 30];
  const stopList = [...(ctx.state.settings?.stopList || [])].sort((a, b) => a.localeCompare(b));
  const stats = getAppStats(ctx.state);
  const due = countDue(ctx.state);

  el.innerHTML = `
    <div class="page settings-page">
    <h1 class="view-title">Настройки</h1>
    <p class="view-subtitle">Интервалы SRS, стоп-лист, экспорт данных.</p>

    <div class="settings-stack">

      <section class="card card-padded settings-card">
        <h2 class="settings-heading">База</h2>
        <div class="settings-stats">
          <div class="stat-item"><span class="stat-num">${stats.words}</span> слов</div>
          <div class="stat-item"><span class="stat-num">${stats.phrases}</span> выражений</div>
          <div class="stat-item"><span class="stat-num">${stats.learnedWords + stats.learnedPhrases}</span> выучено</div>
          <div class="stat-item"><span class="stat-num">${due}</span> к повторению</div>
        </div>
      </section>

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
        <h2 class="settings-heading">Стоп-лист</h2>
        <p class="settings-hint">Эти слова не предлагаются при импорте.</p>
        <div class="stop-tags" id="stop-tags">
          ${stopList.length
            ? stopList.map((w) => stopTag(w)).join("")
            : `<span class="settings-empty">Стоп-лист пуст</span>`}
        </div>
        <div class="stop-add">
          <input type="text" id="stop-new" placeholder="Добавить слово…" />
          <button id="stop-add-btn" class="btn btn-sm">+ Добавить</button>
        </div>
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
        <p class="settings-hint">Удалить все слова, выражения, сериалы, книги, прогресс SRS и историю. Стоп-лист сбросится к умолчанию. Необратимо — сначала сделайте экспорт.</p>
        <button id="hard-reset" class="btn btn-danger">HARD RESET — начать с нуля</button>
      </section>

    </div>
    </div>
  `;

  el.querySelector("#save-intervals").addEventListener("click", () => {
    const vals = [...el.querySelectorAll(".interval-input")].map((inp) => inp.value);
    updateIntervals(ctx.state, vals);
    ctx.save();
    flash(el, "Интервалы сохранены ✔");
  });

  el.querySelector("#stop-add-btn").addEventListener("click", () => {
    const inp = el.querySelector("#stop-new");
    const word = inp.value.trim();
    if (!word) return;
    if (addStopWord(ctx.state, word)) {
      ctx.save();
      inp.value = "";
      renderSettings(el, ctx);
      flash(el, `«${word}» добавлено в стоп-лист`);
    } else {
      flash(el, "Слово уже в стоп-листе", true);
    }
  });

  el.querySelector("#stop-new").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.querySelector("#stop-add-btn").click();
  });

  el.querySelectorAll(".stop-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeStopWord(ctx.state, btn.dataset.word);
      ctx.save();
      renderSettings(el, ctx);
    });
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

  el.querySelector("#hard-reset").addEventListener("click", () => {
    if (!confirm("HARD RESET: удалить ВСЕ слова, прогресс, сериалы и книги?")) return;
    if (!confirm("Последнее предупреждение. Данные можно вернуть только из экспорта. Продолжить?")) return;
    hardResetState(ctx.state);
    ctx.save();
    renderSettings(el, ctx);
    flash(el, "Данные полностью сброшены");
  });
}

function stopTag(word) {
  return `
    <span class="stop-tag">
      ${esc(word)}
      <button class="stop-remove" data-word="${escAttr(word)}" title="Удалить">×</button>
    </span>`;
}

function flash(el, text, isError = false) {
  const msg = el.querySelector("#settingsMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = `settings-msg ${isError ? "settings-msg-err" : "settings-msg-ok"}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
