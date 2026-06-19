import { parseFileContent, parseFileName } from "../core/parser.js";
import { analyzeText, analyzeSummary, analyzePhrases, phraseSummary } from "../core/analyzer.js";
import {
  addWords, addPhrases, addStopWord, addKnownWordFromImport, addKnownPhraseFromImport,
  resolveImportSource,
} from "../db/database.js";
import { getDictionary, getFormsIndex, translate, translatorUrl } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import { attachSwipeCard } from "../ui/swipe-card.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260714";
import { refreshPageScrollTop, unbindScrollTop } from "../ui/scroll-top.js";
import { btnLearned, btnStopList } from "../ui/action-icons.js";

let session = null;
let swipeDetach = null;
let pendingImportCommit = null;
let importConfirmModalReady = false;

const defaultUi = () => ({
  tab: "words",
  view: "list",
  stackIndex: 0,
  wordsPhase: "withTrans",
  phrasesPhase: "withTrans",
});

export function renderImport(el, ctx) {
  session = null;
  swipeDetach = null;

  el.innerHTML = `
    <div class="page import-page">
      <h1 class="view-title view-title-section">Импорт текста</h1>

      <div class="card card-padded">
        <div class="import-upload">
          <label class="import-filelabel">
            <input type="file" id="import-file" accept=".srt,.txt" hidden />
            <span class="import-filebtn btn btn-lg">Загрузить новый файл</span>
          </label>
          <span id="import-filename" class="import-filename">srt или txt</span>
        </div>
        <div id="import-meta" class="import-meta" hidden></div>
      </div>

      <div id="import-result" class="import-result" hidden></div>
    </div>
  `;

  const resultBox = el.querySelector("#import-result");
  resultBox.addEventListener("click", (e) => {
    if (!e.target.closest("#btn-commit")) return;
    e.preventDefault();
    if (!session) return;
    openImportConfirm(el, ctx);
  });

  ensureImportConfirmModal();
  el.querySelector("#import-file")
    .addEventListener("change", (e) => handleFile(el, ctx, e.target.files?.[0]));
}

async function handleFile(el, ctx, file) {
  if (!file) return;
  el.querySelector("#import-result").hidden = true;
  el.querySelector("#import-filename").textContent = file.name;

  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (ext !== "srt" && ext !== "txt") {
    return showError(el, "Поддерживаются только файлы .srt и .txt");
  }

  let raw;
  try { raw = await file.text(); }
  catch { return showError(el, "Не удалось прочитать файл."); }

  const text = parseFileContent(raw, ext);
  if (!text) return showError(el, "Файл пустой или не содержит текста.");

  const meta = parseFileName(file.name);
  session = {
    fileName: file.name, ext, text, meta,
    words: [], phrases: [], dict: null, phrasesDb: null,
    ui: defaultUi(),
  };
  renderMeta(el, meta);
  await runAnalyze(el, ctx);
}

function renderMeta(el, meta) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;

  const fields = meta.kind === "srt" ? `
    <div class="form-grid form-grid-show">
      <div class="field-row-compact">
        <label class="field-label field-grow">Сериал<input type="text" id="m-show" value="${esc(meta.show)}" /></label>
        <label class="field-label field-num">Сезон<input type="number" id="m-season" class="input-num" value="${meta.season ?? ""}" min="0" /></label>
      </div>
      <div class="field-row-compact">
        <label class="field-label field-grow">Название серии<input type="text" id="m-eptitle" value="${esc(meta.episodeTitle)}" /></label>
        <label class="field-label field-num">Серия<input type="number" id="m-episode" class="input-num" value="${meta.episode ?? ""}" min="0" /></label>
      </div>
    </div>` : `
    <div class="form-grid form-grid-book">
      <label class="field-label field-full">Книга<input type="text" id="m-book" value="${esc(meta.book)}" /></label>
      <div class="field-row-compact">
        <label class="field-label field-num">Глава<input type="number" id="m-chapter" class="input-num" value="${meta.chapter ?? ""}" min="0" /></label>
      </div>
      <label class="field-label field-full">Название главы<input type="text" id="m-chtitle" value="${esc(meta.chapterTitle)}" /></label>
    </div>`;

  box.innerHTML = `
    <p class="import-section-title">${meta.kind === "srt" ? "Распознано как сериал" : "Распознано как книга"}</p>
    ${fields}
  `;
}

async function runAnalyze(el, ctx) {
  const resultBox = el.querySelector("#import-result");
  resultBox.hidden = false;
  resultBox.innerHTML = `<div class="card card-padded"><p class="muted">Загрузка словаря…</p></div>`;

  try {
    const dict = await getDictionary();
    const forms = getFormsIndex();
    const phrasesDb = await getPhrases();
    session.dict = dict;
    session.phrasesDb = phrasesDb;

    session.words = analyzeText(ctx.state, session.text, dict, forms).map((w) => ({
      ...w,
      translations: translate(w.lemma, dict),
      manualTranslation: "",
    }));

    session.phrases = analyzePhrases(ctx.state, session.text, dict, forms, phrasesDb).map((p) => ({
      ...p,
      translations: translatePhrase(p.text, phrasesDb),
      manualTranslation: "",
    }));

    session.ui = defaultUi();
    session.totals = { wordAdded: 0, wordUpdated: 0, phraseAdded: 0, phraseUpdated: 0, label: "" };
    initPhases();
    renderResult(el, ctx);
  } catch (err) {
    resultBox.innerHTML = `<div class="card card-padded"><div class="import-error">Ошибка при разборе: ${esc(err.message)}</div></div>`;
  }
}

function liveWords() {
  return session.words.filter((w) => !w.removed && w.included);
}

function livePhrases() {
  return session.phrases.filter((p) => !p.removed && p.included);
}

function isNewWord(w) {
  return !w.known && !w.stop && !w.studying;
}

function isNewPhrase(p) {
  return !p.known && !p.studying;
}

function hasTranslation(item) {
  return resolveTranslations(item).length > 0;
}

function newWordsWithTrans() {
  return session.words.filter((w) => !w.removed && isNewWord(w) && hasTranslation(w));
}

function newWordsNoTrans() {
  return session.words.filter((w) => !w.removed && isNewWord(w) && !hasTranslation(w));
}

function newPhrasesWithTrans() {
  return session.phrases.filter((p) => !p.removed && isNewPhrase(p) && hasTranslation(p));
}

function newPhrasesNoTrans() {
  return session.phrases.filter((p) => !p.removed && isNewPhrase(p) && !hasTranslation(p));
}

function displayWords() {
  return session.ui.wordsPhase === "withTrans" ? newWordsWithTrans() : newWordsNoTrans();
}

function displayPhrases() {
  return session.ui.phrasesPhase === "withTrans" ? newPhrasesWithTrans() : newPhrasesNoTrans();
}

function initPhases() {
  session.ui.wordsPhase = newWordsWithTrans().length > 0 ? "withTrans" : "noTrans";
  session.ui.phrasesPhase = newPhrasesWithTrans().length > 0 ? "withTrans" : "noTrans";
  syncSelectionToPhases();
}

function syncSelectionToPhases() {
  const visibleWords = new Set(displayWords());
  const visiblePhrases = new Set(displayPhrases());
  for (const w of session.words) {
    if (w.removed) continue;
    w.included = visibleWords.has(w);
  }
  for (const p of session.phrases) {
    if (p.removed) continue;
    p.included = visiblePhrases.has(p);
  }
}

function maybeAdvanceWordsPhase(el, ctx) {
  if (session.ui.wordsPhase !== "withTrans") return false;
  if (newWordsWithTrans().length > 0) return false;
  if (newWordsNoTrans().length === 0) return false;
  session.ui.wordsPhase = "noTrans";
  session.ui.stackIndex = 0;
  syncSelectionToPhases();
  renderResult(el, ctx);
  return true;
}

function maybeAdvancePhrasesPhase(el, ctx) {
  if (session.ui.phrasesPhase !== "withTrans") return false;
  if (newPhrasesWithTrans().length > 0) return false;
  if (newPhrasesNoTrans().length === 0) return false;
  session.ui.phrasesPhase = "noTrans";
  session.ui.stackIndex = 0;
  syncSelectionToPhases();
  renderResult(el, ctx);
  return true;
}

function importSessionComplete() {
  return newWordsWithTrans().length === 0
    && newWordsNoTrans().length === 0
    && newPhrasesWithTrans().length === 0
    && newPhrasesNoTrans().length === 0;
}

function bulkBarHtml(kind) {
  const visible = kind === "word" ? displayWords() : displayPhrases();
  const selected = visible.filter((item) => item.included).length;
  const allIncluded = visible.length > 0 && visible.every((item) => item.included);
  const selectAllId = kind === "word" ? "import-select-all-words" : "import-select-all-phrases";

  return `
    <div class="bulk-bar">
      <label><input type="checkbox" id="${selectAllId}" ${allIncluded ? "checked" : ""} /> Выбрать всё</label>
      <span class="import-row-meta" id="import-selected-count">Выбрано: ${selected}</span>
    </div>`;
}

function updateSelectedCount(el, kind) {
  const visible = kind === "word" ? displayWords() : displayPhrases();
  const selected = visible.filter((item) => item.included).length;
  const span = el.querySelector("#import-selected-count");
  if (span) span.textContent = `Выбрано: ${selected}`;
}

function renderResult(el, ctx) {
  if (session.ui.wordsPhase === "withTrans" && !newWordsWithTrans().length && newWordsNoTrans().length) {
    session.ui.wordsPhase = "noTrans";
    session.ui.stackIndex = 0;
    syncSelectionToPhases();
  }
  if (session.ui.phrasesPhase === "withTrans" && !newPhrasesWithTrans().length && newPhrasesNoTrans().length) {
    session.ui.phrasesPhase = "noTrans";
    session.ui.stackIndex = 0;
    syncSelectionToPhases();
  }

  const box = el.querySelector("#import-result");
  box.hidden = false;
  const wc = displayWords().length;
  const pc = displayPhrases().length;
  const hasVisible = wc > 0 || pc > 0;
  const { tab, view } = session.ui;

  box.innerHTML = `
    <div class="card card-padded import-section-gap">
      ${hasVisible ? `
      <div class="import-commit-row">
        <button type="button" id="btn-commit" class="btn">Добавить выбранные в словарь</button>
      </div>` : ""}
      <div class="import-toolbar">
        <div class="tabs import-kind-tabs" role="tablist">
          <button type="button" class="tab-btn ${tab === "words" ? "active" : ""}" data-tab="words">Слова (${wc})</button>
          <button type="button" class="tab-btn ${tab === "phrases" ? "active" : ""}" data-tab="phrases">Фразы (${pc})</button>
        </div>
        ${(tab === "words" ? wc : pc) > 0 ? `
        <div class="tabs import-view-tabs">
          <button type="button" class="tab-btn ${view === "list" ? "active" : ""}" data-view="list">Список</button>
          <button type="button" class="tab-btn ${view === "cards" ? "active" : ""}" data-view="cards">Карточки</button>
        </div>` : ""}
      </div>
      <div id="import-panel"></div>
      <div id="import-done" class="import-done" hidden></div>
    </div>
  `;

  box.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.ui.tab = btn.dataset.tab;
      session.ui.stackIndex = 0;
      renderResult(el, ctx);
    });
  });

  box.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.ui.view = btn.dataset.view;
      session.ui.stackIndex = 0;
      renderResult(el, ctx);
    });
  });

  renderPanel(el, ctx);
  refreshPageScrollTop("import");
}

function ensureImportConfirmModal() {
  if (importConfirmModalReady) return;

  const modal = document.getElementById("import-confirm-modal");
  if (!modal) {
    console.error("import-confirm-modal not found in index.html");
    return;
  }

  const close = () => {
    modal.hidden = true;
    pendingImportCommit = null;
  };

  modal.querySelector("#import-confirm-backdrop")?.addEventListener("click", close);
  modal.querySelector("#import-confirm-edit")?.addEventListener("click", close);
  modal.querySelector("#import-confirm-ok")?.addEventListener("click", () => {
    const run = pendingImportCommit;
    close();
    if (run) run();
  });

  importConfirmModalReady = true;
}

function getChosenItems() {
  const visibleWords = new Set(displayWords());
  const visiblePhrases = new Set(displayPhrases());
  const chosenWords = session.words.filter((w) => w.included && !w.removed && visibleWords.has(w));
  const chosenPhrases = session.phrases.filter((p) => p.included && !p.removed && visiblePhrases.has(p));
  return { chosenWords, chosenPhrases };
}

function openImportConfirm(el, ctx) {
  const { chosenWords, chosenPhrases } = getChosenItems();
  if (chosenWords.length === 0 && chosenPhrases.length === 0) {
    alert("Не выбрано ни одного элемента.");
    return;
  }

  ensureImportConfirmModal();
  pendingImportCommit = () => commit(el, ctx);

  const body = document.getElementById("import-confirm-body");
  if (body) body.innerHTML = buildConfirmBody(chosenWords, chosenPhrases);

  const modal = document.getElementById("import-confirm-modal");
  if (!modal) return;
  modal.hidden = false;
}

function buildConfirmBody(words, phrases) {
  const wordBlock = words.length
    ? `
      <div class="import-confirm-section">
        <p class="import-confirm-heading">Слова — <strong>${words.length}</strong></p>
        <ul class="import-confirm-list">${words.map((w) => `<li>${esc(w.lemma)}</li>`).join("")}</ul>
      </div>`
    : "";

  const phraseBlock = phrases.length
    ? `
      <div class="import-confirm-section">
        <p class="import-confirm-heading">Выражения — <strong>${phrases.length}</strong></p>
        <ul class="import-confirm-list">${phrases.map((p) => `<li>${esc(p.text)}</li>`).join("")}</ul>
      </div>`
    : "";

  return `
    <p class="modal-warning">Будет добавлено в базу:</p>
    ${wordBlock}
    ${phraseBlock}`;
}

function renderPanel(el, ctx) {
  if (swipeDetach) {
    swipeDetach();
    swipeDetach = null;
  }

  const panel = el.querySelector("#import-panel");
  if (!panel) return;

  const isPhrases = session.ui.tab === "phrases";
  const stats = isPhrases ? phraseStatsHtml() : wordStatsHtml();

  if (isPhrases) {
    const ps = phraseSummary(session.phrases);
    if (ps.total === 0) {
      panel.innerHTML = `${stats}<p class="list-empty">Выражения не найдены</p>`;
      return;
    }
    if (!displayPhrases().length) {
      const pending = session.ui.phrasesPhase === "withTrans" && newPhrasesNoTrans().length > 0
        ? `<p class="list-empty">Выражения с переводом обработаны. Перейдите к фразам без перевода во вкладке «Фразы».</p>`
        : `<p class="list-empty">Нет новых выражений для импорта — все уже знаете или на изучении.</p>`;
      panel.innerHTML = `${stats}${pending}`;
      return;
    }
  } else if (!displayWords().length) {
    const pending = session.ui.wordsPhase === "withTrans" && newWordsNoTrans().length > 0
      ? `<p class="list-empty">Слова с переводом обработаны. Добавьте оставшиеся или перейдите к словам без перевода.</p>`
      : `<p class="list-empty">Нет новых слов для импорта — все уже знаете, в стоп-листе или на изучении.</p>`;
    panel.innerHTML = `${wordStatsHtml()}${pending}`;
    return;
  }

  panel.innerHTML = `${stats}${
    session.ui.view === "cards"
      ? (isPhrases ? renderPhraseCards(el, ctx) : renderWordCards(el, ctx))
      : (isPhrases ? renderPhraseList(el) : renderWordList(el))
  }`;

  if (session.ui.view === "cards") {
    if (isPhrases) bindPhraseCards(el, ctx);
    else bindWordCards(el, ctx);
  } else if (isPhrases) {
    bindPhraseListEvents(el, ctx);
  } else {
    bindWordListEvents(el, ctx);
  }
  bindImportTransChips(el);
}

function wordStatsHtml() {
  const withTrans = newWordsWithTrans().length;
  const noTrans = newWordsNoTrans().length;
  const phase = session.ui.wordsPhase;

  if (phase === "noTrans") {
    return `
      <div class="import-stats import-stats-summary">
        <p class="import-stats-lead import-stats-phase">
          Нашлось <strong>${noTrans}</strong> ${pluralWords(noTrans)} без перевода.
          Впишите вручную или отправьте в стоп-лист, если это не слова.
        </p>
      </div>`;
  }

  const ws = analyzeSummary(session.words);
  return `
    <div class="import-stats import-stats-summary">
      <p class="import-stats-lead">
        В этом файле <strong>${ws.total}</strong> уникальных слов:
        знаю <strong>${ws.knownCount}</strong>,
        в стоп-листе <strong>${ws.stopCount}</strong>,
        на изучении <strong>${ws.studyingCount}</strong>,
        новых <strong>${ws.newCount}</strong>.
      </p>
      <p class="import-stats-lead import-stats-phase">
        Слова с переводом — <strong>${withTrans}</strong><br />
        Без перевода — <strong>${noTrans}</strong>
      </p>
    </div>`;
}

function phraseStatsHtml() {
  const withTrans = newPhrasesWithTrans().length;
  const noTrans = newPhrasesNoTrans().length;
  const phase = session.ui.phrasesPhase;

  if (phase === "noTrans") {
    return `
      <div class="import-stats import-stats-summary">
        <p class="import-stats-lead import-stats-phase">
          Нашлось <strong>${noTrans}</strong> ${pluralPhrases(noTrans)} без перевода.
          Впишите вручную или отметьте «Знаю», если уже знаете.
        </p>
      </div>`;
  }

  const ps = phraseSummary(session.phrases);
  return `
    <div class="import-stats import-stats-summary">
      <p class="import-stats-lead">
        В этом файле <strong>${ps.total}</strong> выражений:
        знаю <strong>${ps.knownCount}</strong>,
        на изучении <strong>${ps.studyingCount}</strong>,
        новых <strong>${ps.newCount}</strong>.
      </p>
      <p class="import-stats-lead import-stats-phase">
        Выражения с переводом — <strong>${withTrans}</strong><br />
        Без перевода — <strong>${noTrans}</strong>
      </p>
    </div>`;
}

function pluralWords(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "слово";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "слова";
  return "слов";
}

function pluralPhrases(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "выражение";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "выражения";
  return "выражений";
}

function renderWordCards(el, ctx) {
  const visible = displayWords();
  if (!visible.length) {
    const pending = session.ui.wordsPhase === "withTrans" && newWordsNoTrans().length > 0;
    return `<p class="list-empty">${pending ? "Слова с переводом обработаны." : "Нет слов для импорта на этом шаге."}</p>`;
  }

  if (session.ui.stackIndex >= visible.length) session.ui.stackIndex = 0;
  const w = visible[session.ui.stackIndex];
  const i = session.words.indexOf(w);
  const trans = resolveTranslations(w);
  const transHtml = trans.length
    ? esc(trans[0]) + (trans.length > 1 ? `<span class="import-row-meta"> +${trans.length - 1}</span>` : "")
    : `<span class="muted">нет перевода</span>`;
  const forms = (w.forms || []).slice(0, 5).map((f) => `<span class="chip">${esc(f)}</span>`).join("");

  return `
    <div class="swipe-stack-wrap">
      <p class="swipe-hint-text">← Стоп · → Знаю · ↑ К импорту</p>
      <div class="swipe-stage">
        <div class="swipe-card card" id="import-swipe">
          <div class="swipe-hint swipe-hint-left" hidden>СТОП</div>
          <div class="swipe-hint swipe-hint-right" hidden>ЗНАЮ</div>
          <div class="swipe-hint swipe-hint-up" hidden>ИМПОРТ ↑</div>
          <div class="swipe-card-inner">
            <div class="swipe-card-word">${esc(w.lemma)}</div>
            <div class="import-row-meta">встречается ${w.count}×</div>
            <div class="swipe-card-trans ${trans.length ? "" : "muted"}">${transHtml}</div>
            <div style="margin-top:0.75rem">${forms}</div>
          </div>
        </div>
      </div>
      <div class="swipe-actions">
        <button type="button" class="btn outline btn-sm" data-swipe="stop" data-i="${i}">Стоп</button>
        <button type="button" class="btn btn-sm" data-swipe="import" data-i="${i}">Импорт</button>
        <button type="button" class="btn outline btn-sm" data-swipe="known" data-i="${i}">Знаю</button>
      </div>
    </div>`;
}

function bindWordCards(el, ctx) {
  const visible = displayWords();
  if (!visible.length) return;

  const swipeEl = el.querySelector("#import-swipe");
  if (swipeEl) {
    const w = visible[session.ui.stackIndex];
    const i = session.words.indexOf(w);
    swipeDetach = attachSwipeCard(swipeEl, {
      onLeft: () => wordAction(el, ctx, i, "stop"),
      onRight: () => wordAction(el, ctx, i, "known"),
      onSwipeUp: () => wordAction(el, ctx, i, "import"),
    });
  }

  el.querySelectorAll("[data-swipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wordAction(el, ctx, +btn.dataset.i, btn.dataset.swipe);
    });
  });
}

function wordAction(el, ctx, i, act) {
  const w = session.words[i];
  if (!w || w.removed) return;

  if (act === "import") {
    w.included = true;
    session.ui.stackIndex++;
    renderPanel(el, ctx);
    return;
  }

  const fakeBtn = { dataset: { i: String(i), act: act === "stop" ? "stop" : "known" } };
  handleRowAction(el, ctx, fakeBtn, "word");
}

function renderWordList(el) {
  const visible = displayWords();
  if (!visible.length) {
    const pending = session.ui.wordsPhase === "withTrans" && newWordsNoTrans().length > 0;
    return `<p class="list-empty">${pending ? "Слова с переводом обработаны." : "Нет слов для импорта на этом шаге."}</p>`;
  }

  return `
    ${bulkBarHtml("word")}
    <div class="import-rows" id="import-word-rows">
      ${visible.map((w) => wordRowCard(w, session.words.indexOf(w))).join("")}
    </div>`;
}

function wordRowCard(w, i) {
  const forms = (w.forms || []).slice(0, 5).map((f) => `<span class="chip">${esc(f)}</span>`).join("");

  return `
    <div class="import-row ${w.included ? "" : "row-excluded"}" data-kind="word" data-i="${i}">
      <div class="import-row-main">
        <input type="checkbox" data-kind="word" data-i="${i}" ${w.included ? "checked" : ""} />
        <div>
          <div class="import-row-title">${esc(w.lemma)} <span class="import-row-meta">×${w.count}</span> <span class="tag tag-new">новое</span></div>
          <div>${forms}</div>
        </div>
      </div>
      <div class="import-row-trans">${translationCell(w, i, "word")}</div>
      <div class="import-row-actions">
        ${btnLearned(`data-act="known" data-kind="word" data-i="${i}"`, { title: "Знаю", extraClass: "row-btn-known" })}
        ${btnStopList(`data-act="stop" data-kind="word" data-i="${i}"`)}
      </div>
    </div>`;
}

function bindWordListEvents(el, ctx) {
  el.querySelector("#import-select-all-words")?.addEventListener("change", (e) => {
    const val = e.target.checked;
    displayWords().forEach((w) => { w.included = val; });
    renderPanel(el, ctx);
  });

  el.querySelector("#import-word-rows")?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.words[i].included = cb.checked;
      cb.closest(".import-row")?.classList.toggle("row-excluded", !cb.checked);
      updateSelectedCount(el, "word");
    });
  });

  el.querySelectorAll(".trans-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i;
      const kind = inp.dataset.kind;
      const list = kind === "word" ? session.words : session.phrases;
      const val = inp.value.trim();
      list[i].manualTranslation = val;
      list[i].translations = val ? [val] : [];
    });
  });

  el.querySelectorAll(".row-btn-known, .row-btn-stop").forEach((btn) => {
    btn.addEventListener("click", () => handleRowAction(el, ctx, btn, "word"));
  });
}

function renderPhraseCards(el, ctx) {
  const visible = displayPhrases();
  if (!visible.length) {
    const pending = session.ui.phrasesPhase === "withTrans" && newPhrasesNoTrans().length > 0;
    return `<p class="list-empty">${pending ? "Выражения с переводом обработаны." : "Нет выражений для импорта на этом шаге."}</p>`;
  }

  if (session.ui.stackIndex >= visible.length) session.ui.stackIndex = 0;
  const p = visible[session.ui.stackIndex];
  const i = session.phrases.indexOf(p);
  const trans = resolveTranslations(p);
  const transHtml = trans.length
    ? esc(trans[0]) + (trans.length > 1 ? `<span class="import-row-meta"> +${trans.length - 1}</span>` : "")
    : `<span class="muted">нет перевода</span>`;

  return `
    <div class="swipe-stack-wrap">
      <p class="swipe-hint-text">→ Знаю · ↑ К импорту</p>
      <div class="swipe-stage">
        <div class="swipe-card card" id="import-swipe">
          <div class="swipe-hint swipe-hint-right" hidden>ЗНАЮ</div>
          <div class="swipe-hint swipe-hint-up" hidden>ИМПОРТ ↑</div>
          <div class="swipe-card-inner">
            <div class="swipe-card-word">${esc(p.text)}</div>
            <div class="import-row-meta">встречается ${p.count}×</div>
            <div class="swipe-card-trans ${trans.length ? "" : "muted"}">${transHtml}</div>
          </div>
        </div>
      </div>
      <div class="swipe-actions">
        <button type="button" class="btn btn-sm" data-swipe="import" data-i="${i}">Импорт</button>
        <button type="button" class="btn outline btn-sm" data-swipe="known" data-i="${i}">Знаю</button>
      </div>
    </div>`;
}

function bindPhraseCards(el, ctx) {
  const visible = displayPhrases();
  if (!visible.length) return;

  const swipeEl = el.querySelector("#import-swipe");
  if (swipeEl) {
    const p = visible[session.ui.stackIndex];
    const i = session.phrases.indexOf(p);
    swipeDetach = attachSwipeCard(swipeEl, {
      onRight: () => phraseAction(el, ctx, i, "known"),
      onSwipeUp: () => phraseAction(el, ctx, i, "import"),
    });
  }

  el.querySelectorAll("[data-swipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      phraseAction(el, ctx, +btn.dataset.i, btn.dataset.swipe);
    });
  });
}

function phraseAction(el, ctx, i, act) {
  const p = session.phrases[i];
  if (!p || p.removed) return;

  if (act === "import") {
    p.included = true;
    session.ui.stackIndex++;
    renderPanel(el, ctx);
    return;
  }

  const fakeBtn = { dataset: { i: String(i), act: "known" } };
  handleRowAction(el, ctx, fakeBtn, "phrase");
}

function renderPhraseList(el) {
  const visible = displayPhrases();
  if (!visible.length) {
    const pending = session.ui.phrasesPhase === "withTrans" && newPhrasesNoTrans().length > 0;
    return `<p class="list-empty">${pending ? "Выражения с переводом обработаны." : "Нет выражений для импорта на этом шаге."}</p>`;
  }

  return `
    ${bulkBarHtml("phrase")}
    <div class="import-rows" id="import-phrase-rows">
      ${visible.map((p) => phraseRowCard(p, session.phrases.indexOf(p))).join("")}
    </div>`;
}

function bindPhraseListEvents(el, ctx) {
  el.querySelector("#import-select-all-phrases")?.addEventListener("change", (e) => {
    const val = e.target.checked;
    displayPhrases().forEach((p) => { p.included = val; });
    renderPanel(el, ctx);
  });

  el.querySelector("#import-phrase-rows")?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.phrases[i].included = cb.checked;
      cb.closest(".import-row")?.classList.toggle("row-excluded", !cb.checked);
      updateSelectedCount(el, "phrase");
    });
  });

  el.querySelectorAll(".trans-input").forEach((inp) => {
    if (inp.dataset.kind !== "phrase") return;
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i;
      const val = inp.value.trim();
      session.phrases[i].manualTranslation = val;
      session.phrases[i].translations = val ? [val] : [];
    });
  });

  el.querySelectorAll(".row-btn-known").forEach((btn) => {
    if (btn.dataset.kind !== "phrase") return;
    btn.addEventListener("click", () => handleRowAction(el, ctx, btn, "phrase"));
  });
}

function phraseRowCard(p, i) {
  return `
    <div class="import-row ${p.included ? "" : "row-excluded"}" data-kind="phrase" data-i="${i}">
      <div class="import-row-main">
        <input type="checkbox" data-kind="phrase" data-i="${i}" ${p.included ? "checked" : ""} />
        <div>
          <div class="import-row-title">${esc(p.text)} <span class="import-row-meta">×${p.count}</span> <span class="tag tag-new">новое</span></div>
        </div>
      </div>
      <div class="import-row-trans">${translationCell(p, i, "phrase")}</div>
      <div class="import-row-actions">
        ${btnLearned(`data-act="known" data-kind="phrase" data-i="${i}"`, { title: "Знаю", extraClass: "row-btn-known" })}
      </div>
    </div>`;
}

function bindImportTransChips(el) {
  bindTransChipsContainers(el, {
    onChange(id, translations) {
      const dash = id.indexOf("-");
      const kind = id.slice(0, dash);
      const idx = +id.slice(dash + 1);
      const list = kind === "word" ? session.words : session.phrases;
      if (!list[idx]) return;
      list[idx].translations = translations;
      list[idx].manualTranslation = "";
    },
  });
}

function translationCell(item, i, kind) {
  const trans = (item.translations || []).filter(Boolean);
  const label = kind === "word" ? item.lemma : item.text;
  if (trans.length) {
    return transChipsHtml(trans, { id: `${kind}-${i}` });
  }
  return `
    <div class="trans-missing">
      <span class="tag tag-missing">нет перевода</span>
      <input type="text" class="trans-input" data-kind="${kind}" data-i="${i}" placeholder="вписать вручную"
        value="${esc(item.manualTranslation)}" />
      <a class="trans-link" href="${translatorUrl(label)}" target="_blank" rel="noopener">↗</a>
    </div>`;
}

function handleRowAction(el, ctx, btn, kind) {
  const i = +btn.dataset.i;
  const act = btn.dataset.act;
  const list = kind === "word" ? session.words : session.phrases;
  const item = list[i];
  if (!item || item.removed) return;

  if (act === "known") {
    const trans = resolveTranslations(item);
    if (kind === "word") {
      addKnownWordFromImport(ctx.state, {
        lemma: item.lemma,
        translations: trans,
        forms: item.forms || [],
      });
    } else {
      addKnownPhraseFromImport(ctx.state, {
        text: item.text,
        translations: trans,
      });
    }
  } else if (act === "stop" && kind === "word") {
    addStopWord(ctx.state, item.lemma, resolveTranslations(item));
  }
  ctx.save();

  item.removed = true;
  item.included = false;

  if (kind === "word" && maybeAdvanceWordsPhase(el, ctx)) return;
  if (kind === "phrase" && maybeAdvancePhrasesPhase(el, ctx)) return;
  if (importSessionComplete()) {
    renderCommitted(el, ctx, {
      wordRes: { added: session.totals.wordAdded, updated: session.totals.wordUpdated },
      phraseRes: { added: session.totals.phraseAdded, updated: session.totals.phraseUpdated },
      label: session.totals.label,
      noTrans: 0,
    });
    return;
  }
  renderResult(el, ctx);
}

function resolveTranslations(item) {
  const list = (item.translations || []).filter(Boolean).slice(0, 3);
  if (list.length) return list;
  const manual = String(item.manualTranslation || "").trim();
  return manual ? [manual] : [];
}

function readMetaFields(el, meta) {
  if (meta.kind === "srt") {
    return {
      show: el.querySelector("#m-show")?.value,
      season: el.querySelector("#m-season")?.value,
      episode: el.querySelector("#m-episode")?.value,
      episodeTitle: el.querySelector("#m-eptitle")?.value,
    };
  }
  return {
    book: el.querySelector("#m-book")?.value,
    chapter: el.querySelector("#m-chapter")?.value,
    chapterTitle: el.querySelector("#m-chtitle")?.value,
  };
}

function commit(el, ctx) {
  const { chosenWords, chosenPhrases } = getChosenItems();

  const fields = readMetaFields(el, session.meta);
  const { sourceId, label } = resolveImportSource(ctx.state, session.meta, fields);

  const wordItems = chosenWords.map((w) => ({
    lemma: w.lemma,
    forms: w.forms,
    translations: resolveTranslations(w),
  }));

  const phraseItems = chosenPhrases.map((p) => ({
    text: p.text,
    translations: resolveTranslations(p),
  }));

  const wordRes = wordItems.length ? addWords(ctx.state, wordItems, sourceId) : { added: 0, updated: 0 };
  const phraseRes = phraseItems.length ? addPhrases(ctx.state, phraseItems, sourceId) : { added: 0, updated: 0 };
  ctx.save();

  session.totals.wordAdded += wordRes.added;
  session.totals.wordUpdated += wordRes.updated;
  session.totals.phraseAdded += phraseRes.added;
  session.totals.phraseUpdated += phraseRes.updated;
  session.totals.label = label;

  chosenWords.forEach((w) => { w.removed = true; w.included = false; });
  chosenPhrases.forEach((p) => { p.removed = true; p.included = false; });

  if (maybeAdvanceWordsPhase(el, ctx)) return;
  if (maybeAdvancePhrasesPhase(el, ctx)) return;

  if (importSessionComplete()) {
    renderCommitted(el, ctx, {
      wordRes: { added: session.totals.wordAdded, updated: session.totals.wordUpdated },
      phraseRes: { added: session.totals.phraseAdded, updated: session.totals.phraseUpdated },
      label: session.totals.label,
      noTrans: 0,
    });
    return;
  }

  renderResult(el, ctx);
}

function resetImportFileForm(el) {
  const filename = el.querySelector("#import-filename");
  if (filename) filename.textContent = "srt или txt";
  const meta = el.querySelector("#import-meta");
  if (meta) {
    meta.hidden = true;
    meta.innerHTML = "";
  }
  const fileInput = el.querySelector("#import-file");
  if (fileInput) fileInput.value = "";
}

function renderCommitted(el, ctx, { wordRes, phraseRes, label, noTrans }) {
  const box = el.querySelector("#import-result");
  if (!box) return;

  resetImportFileForm(el);
  session = null;
  swipeDetach = null;
  unbindScrollTop();

  box.hidden = false;
  box.innerHTML = `
    <div class="card card-padded import-section-gap import-committed">
      <div class="import-done import-done-prominent">
        Импортировано.
        Слова: <b>+${wordRes.added}</b> / обновлено <b>${wordRes.updated}</b>.
        Выражения: <b>+${phraseRes.added}</b> / обновлено <b>${phraseRes.updated}</b>.
        Источник: <b>${esc(label || "—")}</b>
        ${noTrans ? `<br><span class="c-missing">${noTrans} без перевода — дополните в «База знаний → На изучении».</span>` : ""}
      </div>
    </div>`;
}

function showError(el, msg) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;
  box.innerHTML = `<div class="import-error">${esc(msg)}</div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

ensureImportConfirmModal();
