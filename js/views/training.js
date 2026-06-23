import {
  buildSession, prepareCard, resolveMode, applyAnswer,
  countTrainingItems, directionLabel, modeLabel,
  TRAINING_MODE_LABELS, TRAINING_MODE_ORDER,
  canUseChoiceMode, normalizeTrainingModes,
} from "../core/srs.js";
import {
  recordSessionSummary,
  getTodayTrainingSummary,
  stepsInQueue,
  stepsRemaining,
} from "../db/database.js";
import { bindScrollTop } from "../ui/scroll-top.js";
import { attachSwipeCard } from "../ui/swipe-card.js";
import { openTrainEditModal } from "../ui/train-edit-modal.js?v=20260661";

const STEP_SIZE = 10;

let session = null;

const setupDefaults = {
  content: "words",
  direction: "both",
  modes: ["2"],
  dueOnly: true,
};

let setup = { ...setupDefaults };

export function renderTraining(el, ctx) {
  session = null;

  if (ctx.trainingPrep) {
    const prep = ctx.trainingPrep;
    ctx.trainingPrep = null;
    startSession(el, ctx, {
      content: "all",
      direction: "both",
      modes: ["1", "2", "3"],
      dueOnly: false,
      sourceId: prep.sourceId,
      prepLabel: prep.label,
    }, true);
    return;
  }

  renderSetup(el, ctx);
}

function renderSetup(el, ctx) {
  const dueToday = countTrainingItems(ctx.state, {
    content: setup.content,
    direction: setup.direction,
    dueOnly: true,
  });
  const today = getTodayTrainingSummary(ctx.state);
  const history = ctx.state.settings?.sessionHistory || [];
  const choiceOk = canUseChoiceMode(ctx.state, setup.content);
  setup.modes = normalizeTrainingModes(setup.modes, { allowChoice: choiceOk });

  el.innerHTML = `
    <div class="page train-page">
      <h1 class="view-title view-title-section train-page-title">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
          <path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
        </svg>
        Тренировка
      </h1>

      <div class="card card-padded train-setup-card">
        <div class="train-field">
          <div class="segment segment-full" data-segment="content">
            <button type="button" class="segment-btn ${setup.content === "words" ? "active" : ""}" data-value="words">Слова</button>
            <button type="button" class="segment-btn ${setup.content === "phrases" ? "active" : ""}" data-value="phrases">Выражения</button>
            <button type="button" class="segment-btn ${setup.content === "all" ? "active" : ""}" data-value="all">Всё</button>
          </div>
        </div>

        <div class="train-field">
          <div class="segment segment-full" data-segment="direction">
            <button type="button" class="segment-btn ${setup.direction === "enru" ? "active" : ""}" data-value="enru">EN → RU</button>
            <button type="button" class="segment-btn ${setup.direction === "ruen" ? "active" : ""}" data-value="ruen">RU → EN</button>
            <button type="button" class="segment-btn ${setup.direction === "both" ? "active" : ""}" data-value="both">Оба</button>
          </div>
        </div>

        <div class="train-field">
          <div class="mode-stack">
            ${TRAINING_MODE_ORDER.map((value) => {
              const disabled = value === "3" && !choiceOk;
              const active = setup.modes.includes(value);
              return `
              <button type="button" class="mode-btn ${active ? "active" : ""}"
                data-value="${value}"${disabled ? " disabled" : ""}
                aria-pressed="${active}"
                title="${disabled ? "Нужно минимум 4 элемента с переводом" : TRAINING_MODE_LABELS[value]}">
                ${TRAINING_MODE_LABELS[value]}
              </button>`;
            }).join("")}
          </div>
        </div>

        <label class="train-due-row">
          <input type="checkbox" id="t-dueonly" ${setup.dueOnly ? "checked" : ""} />
          Только к повторению сегодня <strong>${dueToday}</strong>
        </label>

        <button id="t-start" class="btn btn-lg btn-block">Начать тренировку</button>
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
          <div class="list-table-wrap">
            <table class="list-table">
              <thead><tr>
                <th>Дата</th><th>Карточек</th><th>Верно</th><th>Ошибок</th>
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
      setup.modes = normalizeTrainingModes(setup.modes, {
        allowChoice: canUseChoiceMode(ctx.state, setup.content),
      });
      renderSetup(el, ctx);
    });
  });

  el.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value;
      if (btn.disabled) return;
      const idx = setup.modes.indexOf(value);
      if (idx >= 0) {
        if (setup.modes.length === 1) return;
        setup.modes.splice(idx, 1);
      } else {
        setup.modes.push(value);
        setup.modes.sort();
      }
      renderSetup(el, ctx);
    });
  });

  el.querySelector("#t-dueonly")?.addEventListener("change", (e) => {
    setup.dueOnly = e.target.checked;
    renderSetup(el, ctx);
  });

  el.querySelector("#t-start").addEventListener("click", () => {
    startSession(el, ctx, {
      content: setup.content,
      direction: setup.direction,
      modes: setup.modes,
      dueOnly: setup.dueOnly,
    });
  });

  bindScrollTop();
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

function canAnswerCard(mode, revealed, answered) {
  if (answered) return false;
  if (mode === 3) return false;
  if (mode === 2 && !revealed) return false;
  return true;
}

function renderSwipeCard(innerHtml, { swipeable, promptOnly = false } = {}) {
  const cardCls = [
    "swipe-card", "train-card", "card", "card-padded",
    promptOnly ? "train-card-prompt" : "",
    swipeable ? "" : "train-card-static",
  ].filter(Boolean).join(" ");

  return `
    <div class="swipe-stage train-swipe-stage">
      <div class="${cardCls}" id="train-swipe">
        ${swipeable ? `
        <div class="swipe-hint swipe-hint-left" hidden>НЕ ЗНАЮ</div>
        <div class="swipe-hint swipe-hint-right" hidden>ЗНАЮ</div>` : ""}
        <div class="swipe-card-inner train-card-inner">${innerHtml}</div>
      </div>
    </div>`;
}

function exciseItemFromSession(el, ctx, itemId, kind) {
  if (!session) return;
  const match = (e) => e.item.id === itemId && e.kind === kind;
  const wasCurrent = match(session.entries[session.index]);

  session.queue = session.queue.filter((e) => !match(e));
  session.totalSteps = stepsInQueue(session.queue.length, STEP_SIZE);

  let removedBefore = 0;
  session.entries = session.entries.filter((e, i) => {
    if (!match(e)) return true;
    if (i < session.index) removedBefore++;
    return false;
  });
  if (!wasCurrent) session.index -= removedBefore;

  if (session.queue.length === 0) {
    renderSessionComplete(el, ctx);
    return;
  }
  if (session.entries.length === 0) {
    if (hasNextStep()) startNextStep(el, ctx);
    else renderStepDone(el, ctx);
    return;
  }
  if (wasCurrent && session.index >= session.entries.length) {
    if (hasNextStep()) startNextStep(el, ctx);
    else renderStepDone(el, ctx);
    return;
  }
  renderCard(el, ctx);
}

function attachTrainSwipe(el, ctx) {
  if (session.swipeDetach) {
    session.swipeDetach();
    session.swipeDetach = null;
  }
  const { mode } = session.current;
  if (!canAnswerCard(mode, session.revealed, session.answered)) return;

  const swipeEl = el.querySelector("#train-swipe");
  if (!swipeEl) return;

  session.swipeDetach = attachSwipeCard(swipeEl, {
    onLeft: () => {
      if (session.answered) return;
      finishCard(el, ctx, false);
    },
    onRight: () => {
      if (session.answered) return;
      finishCard(el, ctx, true);
    },
  });
}

function renderCard(el, ctx) {
  if (session.swipeDetach) {
    session.swipeDetach();
    session.swipeDetach = null;
  }

  const entry = currentEntry();
  const requestedMode = resolveMode(session.opts.modes ?? session.opts.mode);
  const card = prepareCard(ctx.state, entry, requestedMode);
  const mode = card.mode;

  const sameCard = session.current?.entry?.item?.id === entry.item.id
    && session.current?.entry?.direction === entry.direction
    && session.current?.entry?.kind === entry.kind;
  session.current = { entry, mode, card };
  session.revealed = mode === 1 || (mode === 2 && sameCard && session.revealed);
  session.answered = sameCard ? session.answered : false;

  const progress = `${session.index + 1} / ${session.entries.length}`;
  const dir = directionLabel(entry.direction);
  const prepLine = session.prepLabel
    ? `<p class="train-prep-line">${esc(session.prepLabel)}</p>` : "";

  const isChoice = mode === 3;
  const swipeable = canAnswerCard(mode, session.revealed, session.answered);
  const cardInner = isChoice ? renderPromptOnly(card) : renderCardBody(card, mode, session.revealed);
  const editLabel = entry.kind === "word" ? "исправить слово" : "исправить выражение";

  el.innerHTML = `
    <div class="page train-page train-session">
    ${renderSessionHeader(mode, progress, dir)}
    ${prepLine}

    ${renderSwipeCard(cardInner, { swipeable, promptOnly: isChoice })}

    ${isChoice ? renderOptionsBlock(card, false) : ""}

    <div id="train-actions" class="train-actions ${isChoice && session.answered ? "train-actions-single" : ""}">
      ${renderActions(card, mode, session.revealed, session.answered)}
    </div>

    <button type="button" id="t-edit-item" class="btn secondary btn-block train-edit-btn">${editLabel}</button>
    </div>
  `;

  el.querySelector("#t-quit").addEventListener("click", () => renderSetup(el, ctx));

  if (mode === 2 && !session.revealed) {
    el.querySelector(".train-card-inner")?.addEventListener("click", (e) => {
      if (e.target.closest("#t-reveal")) return;
      revealCard(el, ctx);
    });
  }

  el.querySelector("#t-edit-item")?.addEventListener("click", () => {
    openTrainEditModal(ctx, {
      kind: entry.kind,
      itemId: entry.item.id,
      onRemoved: () => exciseItemFromSession(el, ctx, entry.item.id, entry.kind),
      onClose: () => {
        if (session.answered) return;
        renderCard(el, ctx);
      },
    });
  });

  attachTrainSwipe(el, ctx);
  bindCardEvents(el, ctx);
}

function renderSessionHeader(mode, progress, dir) {
  return `
    <div class="train-session-top">
      <div class="train-session-badges">
        <span class="train-badge train-badge-outline">${esc(modeLabel(mode))}</span>
        <span class="train-badge train-badge-progress">${progress}</span>
        <span class="train-badge train-badge-dir">${esc(dir)}</span>
        <button type="button" id="t-quit" class="btn btn-ghost btn-sm train-quit" aria-label="Настройки тренировки">Настройки</button>
      </div>
    </div>`;
}

function revealCard(el, ctx) {
  const { mode, card } = session.current;
  session.revealed = true;
  el.querySelector(".train-card-inner").innerHTML = renderCardBody(card, mode, true);
  el.querySelector("#train-actions").innerHTML = renderActions(card, mode, true, false);
  el.querySelector("#train-actions").className = "train-actions";
  attachTrainSwipe(el, ctx);
  bindCardEvents(el, ctx);
}

function renderPromptOnly(card) {
  return `
    <div class="train-prompt">${esc(card.prompt)}</div>
    <div id="train-card-feedback" class="train-card-feedback" hidden></div>`;
}

function showCardFeedback(el, correct) {
  const fb = el.querySelector("#train-card-feedback");
  if (!fb) return;
  fb.hidden = false;
  fb.textContent = correct ? "Верно!" : "Не верно!";
  fb.className = `train-card-feedback ${correct ? "train-fb-ok" : "train-fb-bad"}`;
}

function isCorrectOption(card, option) {
  return option?.itemId === card.itemId;
}

function findOption(card, itemId) {
  return card.options.find((o) => o.itemId === itemId);
}

function renderOptionsBlock(card, answered) {
  const options = card.options.map((opt) => {
    const isCorrect = answered && isCorrectOption(card, opt);
    const classes = ["train-option"];
    if (answered) {
      if (isCorrect) classes.push("train-option-correct");
    }
    return `
      <button type="button" class="${classes.join(" ")}" data-item-id="${escAttr(opt.itemId)}"
        aria-label="Вариант: ${escAttr(opt.label)}" ${answered ? "disabled" : ""}>
        ${answered && isCorrect ? ICON_CHECK : ""}${esc(opt.label)}
      </button>`;
  }).join("");

  return `
    <div class="train-options-wrap">
      <div class="train-options" id="train-options">${options}</div>
    </div>`;
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
          : `<button type="button" id="t-reveal" class="btn btn-ghost train-reveal-btn" aria-label="Показать перевод">${ICON_EYE}Показать</button>`}
      </div>`;
  }
  return renderPromptOnly(card);
}

function renderActions(card, mode, revealed, answered) {
  if (mode === 3) {
    if (answered) return `<button id="t-next" class="btn btn-block-row">Дальше</button>`;
    return `<p class="train-hint btn-block-row">Выберите правильный вариант</p>`;
  }
  if (mode === 2 && !revealed) {
    return `<p class="train-hint btn-block-row">Нажмите на карточку или «Показать»</p>`;
  }
  return `
    <button type="button" id="t-unknown" class="btn btn-danger train-action-btn" aria-label="Не знаю">${ICON_X}Не знаю</button>
    <button type="button" id="t-knew" class="btn train-knew train-action-btn" aria-label="Знаю">${ICON_CHECK}Знаю</button>`;
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
      const option = findOption(card, btn.dataset.itemId);
      const correct = isCorrectOption(card, option);
      session.answered = true;

      el.querySelectorAll(".train-option").forEach((b) => {
        b.disabled = true;
        const rowOpt = findOption(card, b.dataset.itemId);
        const isAns = isCorrectOption(card, rowOpt);
        const isPicked = b === btn;
        if (isAns) {
          b.classList.add("train-option-correct");
          if (!b.querySelector(".btn-icon")) {
            b.insertAdjacentHTML("afterbegin", ICON_CHECK);
          }
        } else if (isPicked && !correct) {
          b.classList.add("train-option-wrong");
          b.insertAdjacentHTML("afterbegin", ICON_X);
        }
      });

      showCardFeedback(el, correct);

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
    <div class="page train-page">
    <h1 class="view-title train-page-title">${ICON_CAP} Шаг ${session.stepNum} завершён</h1>
    <div class="card card-padded train-done-card">
      ${session.prepLabel ? `<p class="train-done-source">${esc(session.prepLabel)}</p>` : ""}
      <p class="train-done-stat">Карточек: <b>${stats.total}</b></p>
      <p class="train-done-stat">Верно: <b class="c-new">${stats.correct}</b> · Ошибок: <b class="c-stop">${stats.wrong}</b></p>
      <p class="train-done-stat">Точность: <b>${pct}%</b></p>
      ${more
        ? `<p class="train-queue-hint">Осталось: <b>${stepsLeft}</b> ${stepWord(stepsLeft)}</p>`
        : `<p class="train-queue-hint">Очередь пройдена. Сегодня выполнено шагов: <b>${today.steps}</b></p>`}
      <div class="train-done-actions">
        ${more ? `<button type="button" id="t-next-step" class="btn">Следующий шаг →</button>` : ""}
        <button type="button" id="t-home" class="btn secondary">${more ? "Завершить" : "Готово"}</button>
      </div>
    </div>
    </div>
  `;

  el.querySelector("#t-next-step")?.addEventListener("click", () => startNextStep(el, ctx));
  el.querySelector("#t-home").addEventListener("click", () => renderSetup(el, ctx));
  bindScrollTop();
}

function renderSessionComplete(el, ctx) {
  const today = getTodayTrainingSummary(ctx.state);
  el.innerHTML = `
    <div class="page train-page">
    <h1 class="view-title train-page-title">${ICON_CAP} Тренировка завершена</h1>
    <div class="card card-padded train-done-card train-done-card-center">
      <p class="train-done-emoji">🎉</p>
      <p class="train-done-lead">На сегодня всё!</p>
      <p class="train-done-stat">Шагов: <b>${today.steps}</b> · Карточек: <b>${today.cards}</b></p>
      <p class="train-done-stat">Точность: <b>${today.accuracy}%</b></p>
      <button type="button" id="t-home" class="btn btn-block">К тренировке</button>
    </div>
    </div>
  `;
  el.querySelector("#t-home").addEventListener("click", () => renderSetup(el, ctx));
  bindScrollTop();
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

const ICON_CAP = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`;

const ICON_EYE = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

const ICON_CHECK = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

const ICON_X = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
