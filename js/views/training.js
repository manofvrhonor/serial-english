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

const setupDefaults = {
  content: "words",
  direction: "enru",
  mode: "2",
  dueOnly: true,
};

let setup = { ...setupDefaults };

const MODE_LABELS = {
  2: "Открыть перевод",
  1: "Слово + перевод",
  3: "Выбор из 4-х",
  mix: "Смешанный",
};

const MODE_HINTS = {
  2: "Покажется слово, нажмите чтобы открыть перевод.",
  1: "Слово и перевод сразу. Отметьте «Знал» или «Не знал».",
  3: "Слово и 4 варианта перевода — выберите правильный.",
  mix: "Каждая карточка случайно использует один из режимов.",
};

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
    <div class="page train-page">
      <h1 class="view-title train-page-title">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
          <path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
        </svg>
        Тренировка
      </h1>

      <div class="card card-padded train-setup-card">
        ${due ? `<div class="train-due-badge">К повторению сегодня: <strong>${due}</strong></div>` : ""}

        <div class="train-field">
          <div class="train-field-label">Что тренируем</div>
          <div class="segment" data-segment="content">
            <button type="button" class="segment-btn ${setup.content === "words" ? "active" : ""}" data-value="words">Слова</button>
            <button type="button" class="segment-btn ${setup.content === "phrases" ? "active" : ""}" data-value="phrases">Выражения</button>
            <button type="button" class="segment-btn ${setup.content === "all" ? "active" : ""}" data-value="all">Всё</button>
          </div>
        </div>

        <div class="train-field">
          <div class="train-field-label">Направление</div>
          <div class="segment" data-segment="direction">
            <button type="button" class="segment-btn ${setup.direction === "enru" ? "active" : ""}" data-value="enru">EN → RU</button>
            <button type="button" class="segment-btn ${setup.direction === "ruen" ? "active" : ""}" data-value="ruen">RU → EN</button>
            <button type="button" class="segment-btn ${setup.direction === "both" ? "active" : ""}" data-value="both">Оба</button>
          </div>
        </div>

        <div class="train-field">
          <div class="train-field-label">Режим карточек</div>
          <div class="mode-grid" data-segment="mode">
            ${Object.entries(MODE_LABELS).map(([value, label]) => `
              <button type="button" class="mode-btn ${setup.mode === value ? "active" : ""}" data-value="${value}">${label}</button>
            `).join("")}
          </div>
          <p class="train-mode-hint" id="t-mode-hint">${MODE_HINTS[setup.mode] || ""}</p>
        </div>

        <label class="train-due-row">
          <input type="checkbox" id="t-dueonly" ${setup.dueOnly ? "checked" : ""} />
          Только к повторению сегодня
        </label>

        <button id="t-start" class="btn btn-lg btn-block">Начать тренировку</button>
        <p class="train-batch-hint">1 шаг = ${STEP_SIZE} карточек, затем короткая статистика.</p>
      </div>

      ${today.steps ? `
        <section class="card card-padded train-secondary-block">
          <h2 class="settings-heading">Сегодня</h2>
          <p>Шагов: <b>${today.steps}</b> · Карточек: <b>${today.cards}</b> ·
            Верно: <b class="c-new">${today.correct}</b> ·
            Ошибок: <b class="c-stop">${today.wrong}</b> ·
            Точность: <b>${today.accuracy}%</b></p>
        </section>` : ""}

      ${history.length ? `
        <section class="train-history card list-card train-secondary-block">
          <div class="card-padded" style="padding-bottom:0">
            <h2 class="settings-heading">Последние шаги</h2>
          </div>
          <div class="list-table-wrap">
            <table class="list-table">
              <thead><tr>
                <th>Дата</th><th>Карточек</th><th>Верно</th><th>Ошибок</th><th>Источник</th>
              </tr></thead>
              <tbody>${history.slice(0, 10).map(sessionRow).join("")}</tbody>
            </table>
          </div>
        </section>` : ""}
    </div>
  `;

  el.querySelectorAll(".segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seg = btn.closest(".segment").dataset.segment;
      setup[seg] = btn.dataset.value;
      renderSetup(el, ctx);
    });
  });

  el.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setup.mode = btn.dataset.value;
      renderSetup(el, ctx);
    });
  });

  el.querySelector("#t-dueonly")?.addEventListener("change", (e) => {
    setup.dueOnly = e.target.checked;
  });

  el.querySelector("#t-start").addEventListener("click", () => {
    startSession(el, ctx, {
      content: setup.content,
      direction: setup.direction,
      mode: setup.mode,
      dueOnly: setup.dueOnly,
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
  const dir = directionLabel(entry.direction);
  const prepBadge = session.prepLabel
    ? `<span class="train-prep-badge">${esc(session.prepLabel)}</span>` : "";

  el.innerHTML = `
    <div class="page train-page">
    <div class="train-header">
      <button id="t-quit" class="btn outline btn-sm train-quit">← Настройки</button>
      <span class="tag tag-manual">${modeLabel(mode)}</span>
      <span class="train-progress">${progress}</span>
      <span class="train-meta">${dir}</span>
      ${prepBadge}
    </div>

    <div class="train-card card card-padded ${mode === 2 && !session.revealed ? "train-card-clickable" : ""}" id="train-card">
      ${renderCardBody(card, mode, session.revealed)}
    </div>

    <div id="train-actions" class="train-actions ${mode === 3 && session.answered ? "train-actions-single" : ""}">
      ${renderActions(card, mode, session.revealed, session.answered)}
    </div>
    </div>
  `;

  el.querySelector("#t-quit").addEventListener("click", () => renderSetup(el, ctx));

  if (mode === 2 && !session.revealed) {
    el.querySelector("#train-card")?.addEventListener("click", (e) => {
      if (e.target.closest("#t-reveal")) return;
      revealCard(el, ctx);
    });
  }

  bindCardEvents(el, ctx);
}

function revealCard(el, ctx) {
  const { mode, card } = session.current;
  session.revealed = true;
  el.querySelector("#train-card").innerHTML = renderCardBody(card, mode, true);
  el.querySelector("#train-actions").innerHTML = renderActions(card, mode, true, false);
  el.querySelector("#train-actions").className = "train-actions";
  bindCardEvents(el, ctx);
}

function renderCardBody(card, mode, revealed) {
  if (mode === 1) {
    return `
      <div class="train-prompt">${esc(card.prompt)}</div>
      <div class="train-divider"></div>
      <div class="train-answer train-answer-visible">${esc(card.answer)}</div>`;
  }
  if (mode === 2) {
    return `
      <div class="train-prompt">${esc(card.prompt)}</div>
      <div class="train-reveal-area">
        ${revealed
          ? `<div class="train-answer train-answer-visible">${esc(card.answer)}</div>`
          : `<button id="t-reveal" class="btn outline train-reveal-btn">Показать</button>`}
      </div>`;
  }
  return `
    <div class="train-prompt">${esc(card.prompt)}</div>
    <div class="train-options" id="train-options">
      ${card.options.map((opt) => `
        <button type="button" class="train-option" data-opt="${escAttr(opt)}">${esc(opt)}</button>
      `).join("")}
    </div>
    <div id="train-feedback" class="train-feedback" hidden></div>`;
}

function renderActions(card, mode, revealed, answered) {
  if (mode === 3) {
    if (answered) return `<button id="t-next" class="btn btn-block-row">Дальше</button>`;
    return `<p class="train-hint btn-block-row">Выберите правильный вариант</p>`;
  }
  if (mode === 2 && !revealed) return `<p class="train-hint btn-block-row">Нажмите на карточку или «Показать»</p>`;
  return `
    <button id="t-unknown" class="btn outline">Не знал</button>
    <button id="t-knew" class="btn train-knew">Знал</button>`;
}

function bindCardEvents(el, ctx) {
  const { mode, card } = session.current;

  el.querySelector("#t-reveal")?.addEventListener("click", (e) => {
    e.stopPropagation();
    revealCard(el, ctx);
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
      el.querySelector("#train-actions").className = "train-actions train-actions-single";
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
    <div class="page">
    <h1 class="view-title">Шаг ${session.stepNum} завершён</h1>
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
    </div>
  `;

  el.querySelector("#t-next-step")?.addEventListener("click", () => startNextStep(el, ctx));
  el.querySelector("#t-home").addEventListener("click", () => renderSetup(el, ctx));
}

function renderSessionComplete(el, ctx) {
  const today = getTodayTrainingSummary(ctx.state);
  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">Тренировка завершена</h1>
    <div class="train-done">
      <p>Сегодня выполнено шагов: <b>${today.steps}</b></p>
      <p>Карточек: <b>${today.cards}</b> · Точность: <b>${today.accuracy}%</b></p>
      <button id="t-home" class="btn">К тренировке</button>
    </div>
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
