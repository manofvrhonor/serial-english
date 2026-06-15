import {
  buildSession, prepareCard, resolveMode, applyAnswer,
  countDue, directionLabel, modeLabel,
} from "../core/srs.js";
import {
  recordSessionSummary,
  getTodayTrainingSummary,
  stepsInQueue,
  stepsRemaining,
} from "../db/database.js";

const STEP_SIZE = 10;

let session = null;

export function renderTraining(el, ctx) {
  session = null;

  if (ctx.trainingPrep) {
    const prep = ctx.trainingPrep;
    ctx.trainingPrep = null;
    startSession(el, ctx, {
      content: "all",
      direction: "both",
      mode: "mix",
      dueOnly: false,
      sourceId: prep.sourceId,
      prepLabel: prep.label,
    }, true);
    return;
  }

  renderSetup(el, ctx);
}

function renderSetup(el, ctx) {
  const due = countDue(ctx.state);
  const today = getTodayTrainingSummary(ctx.state);
  const history = ctx.state.settings?.sessionHistory || [];

  el.innerHTML = `
    <h1 class="view-title">🎯 Тренировка</h1>
    <p class="view-subtitle">Карточки, режимы, два направления, SRS.</p>

    ${today.steps ? `
      <section class="train-stats-panel">
        <h2 class="settings-heading">📊 Сегодня</h2>
        <p>Шагов: <b>${today.steps}</b> · Карточек: <b>${today.cards}</b> ·
          Верно: <b class="c-new">${today.correct}</b> ·
          Ошибок: <b class="c-stop">${today.wrong}</b> ·
          Точность: <b>${today.accuracy}%</b></p>
      </section>` : ""}

    <div class="train-setup">
      <div class="train-due-badge">${due ? `К повторению сегодня: <b>${due}</b>` : "Нет карточек к повторению"}</div>

      <div class="train-fields">
        <label>Что тренируем
          <select id="t-content">
            <option value="all">Всё</option>
            <option value="words">Слова</option>
            <option value="phrases">Выражения</option>
          </select>
        </label>
        <label>Направление
          <select id="t-direction">
            <option value="both">Оба (случайно)</option>
            <option value="enru">EN→RU</option>
            <option value="ruen">RU→EN</option>
          </select>
        </label>
        <label>Режим
          <select id="t-mode">
            <option value="1">1 — слово + перевод</option>
            <option value="2">2 — перевод по клику</option>
            <option value="3">3 — 4 варианта</option>
            <option value="mix">МИКС</option>
          </select>
        </label>
        <label class="train-check">
          <input type="checkbox" id="t-dueonly" checked />
          Только к повторению сегодня
        </label>
      </div>

      <button id="t-start" class="btn">Начать тренировку</button>
      <p class="train-batch-hint">1 шаг = ${STEP_SIZE} карточек, затем короткая статистика.</p>
    </div>

    ${history.length ? `
      <section class="train-history">
        <h2 class="settings-heading import-section-gap">Последние шаги</h2>
        <div class="list-table-wrap">
          <table class="list-table">
            <thead><tr>
              <th>Дата</th><th>Карточек</th><th>Верно</th><th>Ошибок</th><th>Источник</th>
            </tr></thead>
            <tbody>${history.slice(0, 10).map(sessionRow).join("")}</tbody>
          </table>
        </div>
      </section>` : ""}
  `;

  el.querySelector("#t-start").addEventListener("click", () => {
    startSession(el, ctx, {
      content: el.querySelector("#t-content").value,
      direction: el.querySelector("#t-direction").value,
      mode: el.querySelector("#t-mode").value,
      dueOnly: el.querySelector("#t-dueonly").checked,
    });
  });
}

function startSession(el, ctx, opts, fromPrep = false) {
  const queue = buildSession(ctx.state, opts);
  if (!queue.length) {
    const msg = fromPrep
      ? `В «${opts.prepLabel || "источнике"}» нет неизученных слов или выражений.`
      : opts.dueOnly
        ? "Нет карточек к повторению. Снимите галочку «только к повторению» или импортируйте слова."
        : "Нет карточек для тренировки. Добавьте слова или выражения.";
    alert(msg);
    renderSetup(el, ctx);
    return;
  }

  session = {
    opts,
    queue,
    stepNum: 1,
    totalSteps: stepsInQueue(queue.length, STEP_SIZE),
    entries: queue.slice(0, STEP_SIZE),
    index: 0,
    stats: { total: 0, correct: 0, wrong: 0 },
    prepLabel: opts.prepLabel || null,
  };

  renderCard(el, ctx);
}

function hasNextStep() {
  return session.stepNum < session.totalSteps;
}

function startNextStep(el, ctx) {
  const start = session.stepNum * STEP_SIZE;
  const entries = session.queue.slice(start, start + STEP_SIZE);
  if (!entries.length) {
    renderSessionComplete(el, ctx);
    return;
  }
  session.stepNum++;
  session.entries = entries;
  session.index = 0;
  session.stats = { total: 0, correct: 0, wrong: 0 };
  renderCard(el, ctx);
}

function currentEntry() {
  return session.entries[session.index];
}

function renderCard(el, ctx) {
  const entry = currentEntry();
  const mode = resolveMode(session.opts.mode);
  const card = prepareCard(ctx.state, entry, mode);

  session.current = { entry, mode, card };
  session.revealed = mode === 1;
  session.answered = false;

  const progress = `${session.index + 1} / ${session.entries.length}`;
  const stepsLeft = stepsRemaining(session.queue.length, session.stepNum, STEP_SIZE);
  const dir = directionLabel(entry.direction);
  const prepBadge = session.prepLabel
    ? `<span class="train-prep-badge">${esc(session.prepLabel)}</span>` : "";

  el.innerHTML = `
    <div class="train-header">
      <button id="t-quit" class="btn secondary train-quit">← Выход</button>
      <span class="train-progress">Шаг ${session.stepNum} · ${progress}</span>
      <span class="train-meta">${dir} · ${modeLabel(mode)} · осталось ${stepsLeft} шаг.</span>
      ${prepBadge}
    </div>

    <div class="train-card" id="train-card">
      ${renderCardBody(card, mode, session.revealed)}
    </div>

    <div id="train-actions" class="train-actions">
      ${renderActions(card, mode, session.revealed, session.answered)}
    </div>
  `;

  el.querySelector("#t-quit").addEventListener("click", () => renderSetup(el, ctx));
  bindCardEvents(el, ctx);
}

function renderCardBody(card, mode, revealed) {
  if (mode === 1) {
    return `
      <div class="train-prompt">${esc(card.prompt)}</div>
      <div class="train-answer train-answer-visible">${esc(card.answer)}</div>`;
  }
  if (mode === 2) {
    return `
      <div class="train-prompt">${esc(card.prompt)}</div>
      <div class="train-reveal-area">
        ${revealed
          ? `<div class="train-answer train-answer-visible">${esc(card.answer)}</div>`
          : `<button id="t-reveal" class="btn secondary train-reveal-btn">Показать перевод</button>`}
      </div>`;
  }
  return `
    <div class="train-prompt">${esc(card.prompt)}</div>
    <div class="train-options" id="train-options">
      ${card.options.map((opt) => `
        <button class="train-option" data-opt="${escAttr(opt)}">${esc(opt)}</button>
      `).join("")}
    </div>
    <div id="train-feedback" class="train-feedback" hidden></div>`;
}

function renderActions(card, mode, revealed, answered) {
  if (mode === 3) {
    if (answered) return `<button id="t-next" class="btn train-next-btn">Дальше →</button>`;
    return `<p class="train-hint">Выберите правильный вариант</p>`;
  }
  if (mode === 2 && !revealed) return `<p class="train-hint">Сначала откройте перевод</p>`;
  return `
    <button id="t-knew" class="btn train-knew">✓ Знал</button>
    <button id="t-unknown" class="btn secondary train-unknown">✗ Не знал</button>`;
}

function bindCardEvents(el, ctx) {
  const { mode, card } = session.current;

  el.querySelector("#t-reveal")?.addEventListener("click", () => {
    session.revealed = true;
    el.querySelector("#train-card").innerHTML = renderCardBody(card, mode, true);
    el.querySelector("#train-actions").innerHTML = renderActions(card, mode, true, false);
    bindCardEvents(el, ctx);
  });

  el.querySelector("#t-knew")?.addEventListener("click", () => finishCard(el, ctx, true));
  el.querySelector("#t-unknown")?.addEventListener("click", () => finishCard(el, ctx, false));

  el.querySelectorAll(".train-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (session.answered) return;
      const chosen = btn.dataset.opt;
      const correct = chosen.toLowerCase() === card.answer.toLowerCase();
      session.answered = true;

      el.querySelectorAll(".train-option").forEach((b) => {
        b.disabled = true;
        if (b.dataset.opt.toLowerCase() === card.answer.toLowerCase()) {
          b.classList.add("train-option-correct");
        } else if (b === btn && !correct) {
          b.classList.add("train-option-wrong");
        }
      });

      const fb = el.querySelector("#train-feedback");
      if (fb) {
        fb.hidden = false;
        fb.textContent = correct ? "✓ Верно!" : `✗ Правильно: ${card.answer}`;
        fb.className = `train-feedback ${correct ? "train-fb-ok" : "train-fb-bad"}`;
      }

      finishCard(el, ctx, correct, true);
      el.querySelector("#train-actions").innerHTML = renderActions(card, mode, true, true);
      el.querySelector("#t-next")?.addEventListener("click", () => nextCard(el, ctx));
    });
  });

  el.querySelector("#t-next")?.addEventListener("click", () => nextCard(el, ctx));
}

function finishCard(el, ctx, correct, skipNext = false) {
  if (session.answered && !skipNext) return;
  session.answered = true;

  const { entry, mode } = session.current;
  applyAnswer(ctx.state, entry, mode, correct);
  ctx.save();

  session.stats.total++;
  if (correct) session.stats.correct++;
  else session.stats.wrong++;

  if (!skipNext) setTimeout(() => nextCard(el, ctx), 400);
}

function nextCard(el, ctx) {
  session.index++;
  if (session.index >= session.entries.length) {
    renderStepDone(el, ctx);
  } else {
    renderCard(el, ctx);
  }
}

function renderStepDone(el, ctx) {
  const { stats } = session;
  const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const more = hasNextStep();
  const stepsLeft = stepsRemaining(session.queue.length, session.stepNum, STEP_SIZE);

  recordSessionSummary(ctx.state, stats, session.prepLabel);
  ctx.save();

  const today = getTodayTrainingSummary(ctx.state);

  el.innerHTML = `
    <h1 class="view-title">✓ Шаг ${session.stepNum} завершён</h1>
    <div class="train-done train-done-batch">
      ${session.prepLabel ? `<p class="train-done-source">${esc(session.prepLabel)}</p>` : ""}
      <p>Карточек: <b>${stats.total}</b></p>
      <p>Верно: <b class="c-new">${stats.correct}</b> · Ошибок: <b class="c-stop">${stats.wrong}</b></p>
      <p>Точность: <b>${pct}%</b></p>
      ${more
        ? `<p class="train-queue-hint">Осталось: <b>${stepsLeft}</b> ${stepWord(stepsLeft)}</p>`
        : `<p class="train-queue-hint">Очередь пройдена. Сегодня выполнено шагов: <b>${today.steps}</b></p>`}
      <div class="train-done-actions">
        ${more ? `<button id="t-next-step" class="btn">Следующий шаг →</button>` : ""}
        <button id="t-home" class="btn secondary">${more ? "Завершить" : "Готово"}</button>
      </div>
    </div>
  `;

  el.querySelector("#t-next-step")?.addEventListener("click", () => startNextStep(el, ctx));
  el.querySelector("#t-home").addEventListener("click", () => renderSetup(el, ctx));
}

function renderSessionComplete(el, ctx) {
  const today = getTodayTrainingSummary(ctx.state);
  el.innerHTML = `
    <h1 class="view-title">🎯 Тренировка завершена</h1>
    <div class="train-done">
      <p>Сегодня выполнено шагов: <b>${today.steps}</b></p>
      <p>Карточек: <b>${today.cards}</b> · Точность: <b>${today.accuracy}%</b></p>
      <button id="t-home" class="btn">К тренировке</button>
    </div>
  `;
  el.querySelector("#t-home").addEventListener("click", () => renderSetup(el, ctx));
}

function stepWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "шаг";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "шага";
  return "шагов";
}

function sessionRow(s) {
  const d = new Date(s.date);
  const dateStr = d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  return `
    <tr>
      <td>${esc(dateStr)}</td>
      <td>${s.total}</td>
      <td class="c-new">${s.correct} (${pct}%)</td>
      <td class="c-stop">${s.wrong}</td>
      <td>${esc(s.prepLabel || "—")}</td>
    </tr>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
