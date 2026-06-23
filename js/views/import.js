import { parseFileContent, parseFileName } from "../core/parser.js";
import { analyzeText, analyzeSummary, analyzePhrases, phraseSummary } from "../core/analyzer.js";
import {
  addWords, addPhrases, addStopWord, addKnownWordFromImport, addKnownPhraseFromImport,
  resolveImportSource, setSourceVocabulary, getAppStats,
} from "../db/database.js";
import { ensureSnapshotItems } from "../core/readiness.js";
import { getDictionary, getFormsIndex, translate, translatorUrl } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import {
  getLibraryIndex,
  getLibraryShow,
  importLibraryEpisodes,
  listShowEpisodes,
  parseEpisodeKey,
} from "../import/library.js?v=20260657";
import { attachSwipeCard } from "../ui/swipe-card.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260621";
import { refreshPageScrollTop, unbindScrollTop } from "../ui/scroll-top.js";
import { btnLearned, btnStopList } from "../ui/action-icons.js";

let session = null;
let swipeDetach = null;
let pendingImportCommit = null;
let importConfirmModalReady = false;
let libPicker = null;

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
          <button type="button" class="btn btn-lg outline" id="import-library-btn">Выбрать из библиотеки</button>
          <span id="import-filename" class="import-filename">srt или txt</span>
        </div>
        <div id="import-meta" class="import-meta" hidden></div>
      </div>

      <div id="import-library" class="import-library" hidden></div>

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
  el.querySelector("#import-library-btn")
    ?.addEventListener("click", () => openLibraryPicker(el, ctx));
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
    saveVocabularySnapshot(el, ctx);
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

function activeWords() {
  return session.words.filter((w) => !w.removed);
}

function activePhrases() {
  return session.phrases.filter((p) => !p.removed);
}

function resolveWordsPhase() {
  if (newWordsWithTrans().length > 0) return "withTrans";
  if (newWordsNoTrans().length > 0) return "noTrans";
  if (activeWords().length > 0) return "complete";
  return "withTrans";
}

function resolvePhrasesPhase() {
  if (newPhrasesWithTrans().length > 0) return "withTrans";
  if (newPhrasesNoTrans().length > 0) return "noTrans";
  if (activePhrases().length > 0) return "complete";
  return "withTrans";
}

function displayWords() {
  if (session.ui.wordsPhase === "complete") return [];
  return session.ui.wordsPhase === "withTrans" ? newWordsWithTrans() : newWordsNoTrans();
}

function displayPhrases() {
  if (session.ui.phrasesPhase === "complete") return [];
  return session.ui.phrasesPhase === "withTrans" ? newPhrasesWithTrans() : newPhrasesNoTrans();
}

function importTabWordCount() {
  const visible = displayWords().length;
  return visible > 0 ? visible : activeWords().length;
}

function importTabPhraseCount() {
  const visible = displayPhrases().length;
  return visible > 0 ? visible : activePhrases().length;
}

function initPhases() {
  session.ui.wordsPhase = resolveWordsPhase();
  session.ui.phrasesPhase = resolvePhrasesPhase();
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
  const next = resolveWordsPhase();
  if (next === "withTrans") return false;
  session.ui.wordsPhase = next;
  session.ui.stackIndex = 0;
  syncSelectionToPhases();
  renderResult(el, ctx);
  return true;
}

function maybeAdvancePhrasesPhase(el, ctx) {
  if (session.ui.phrasesPhase !== "withTrans") return false;
  if (newPhrasesWithTrans().length > 0) return false;
  const next = resolvePhrasesPhase();
  if (next === "withTrans") return false;
  session.ui.phrasesPhase = next;
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
  if (session.ui.wordsPhase === "withTrans" && !newWordsWithTrans().length) {
    session.ui.wordsPhase = resolveWordsPhase();
    session.ui.stackIndex = 0;
    syncSelectionToPhases();
  }
  if (session.ui.phrasesPhase === "withTrans" && !newPhrasesWithTrans().length) {
    session.ui.phrasesPhase = resolvePhrasesPhase();
    session.ui.stackIndex = 0;
    syncSelectionToPhases();
  }

  const box = el.querySelector("#import-result");
  box.hidden = false;
  const wc = importTabWordCount();
  const pc = importTabPhraseCount();
  const hasVisible = displayWords().length > 0 || displayPhrases().length > 0;
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
        ${(tab === "words" ? displayWords().length : displayPhrases().length) > 0 ? `
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
      const ps = phraseSummary(session.phrases);
      let pending;
      if (session.ui.phrasesPhase === "complete" && ps.total > 0) {
        pending = `<p class="list-empty">Нет новых выражений для импорта — все <strong>${ps.total}</strong> ${pluralPhrases(ps.total)} из файла уже знаете или на изучении.</p>`;
      } else if (session.ui.phrasesPhase === "withTrans" && newPhrasesNoTrans().length > 0) {
        pending = `<p class="list-empty">Выражения с переводом обработаны. Перейдите к фразам без перевода во вкладке «Фразы».</p>`;
      } else {
        pending = `<p class="list-empty">Нет новых выражений для импорта — все уже знаете или на изучении.</p>`;
      }
      panel.innerHTML = `${stats}${pending}`;
      return;
    }
  } else if (!displayWords().length) {
    const ws = analyzeSummary(session.words);
    let pending;
    if (session.ui.wordsPhase === "complete" && ws.total > 0) {
      pending = `<p class="list-empty">Нет новых слов для импорта — все <strong>${ws.total}</strong> ${pluralWords(ws.total)} из файла уже знаете, в стоп-листе или на изучении.</p>`;
    } else if (session.ui.wordsPhase === "withTrans" && newWordsNoTrans().length > 0) {
      pending = `<p class="list-empty">Слова с переводом обработаны. Добавьте оставшиеся или перейдите к словам без перевода.</p>`;
    } else {
      pending = `<p class="list-empty">Нет новых слов для импорта — все уже знаете, в стоп-листе или на изучении.</p>`;
    }
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

function wordFileSummaryHtml(ws, withTrans, noTrans, showPhaseBreakdown = false) {
  const phasePart = showPhaseBreakdown
    ? `<p class="import-stats-lead import-stats-phase">
        Слова с переводом — <strong>${withTrans}</strong><br />
        Без перевода — <strong>${noTrans}</strong>
      </p>`
    : "";
  return `
    <div class="import-stats import-stats-summary">
      <p class="import-stats-lead">
        <strong>${ws.total}</strong> ${pluralWords(ws.total)}:
        новых <strong>${ws.newCount}</strong> ·
        знаете <strong>${ws.knownCount}</strong> ·
        изучаете <strong>${ws.studyingCount}</strong> ·
        без перевода <strong>${ws.noTransCount}</strong> ·
        стоп <strong>${ws.stopCount}</strong>.
      </p>
      ${phasePart}
    </div>`;
}

function wordStatsHtml() {
  const withTrans = newWordsWithTrans().length;
  const noTrans = newWordsNoTrans().length;
  const phase = session.ui.wordsPhase;
  const ws = analyzeSummary(session.words);

  if (phase === "complete" && ws.total > 0) {
    return wordFileSummaryHtml(ws, withTrans, noTrans, false);
  }

  if (phase === "noTrans") {
    return `
      <div class="import-stats import-stats-summary">
        <p class="import-stats-lead import-stats-phase">
          Нашлось <strong>${noTrans}</strong> ${pluralWords(noTrans)} без перевода.
          Впишите вручную или отправьте в стоп-лист, если это не слова.
        </p>
      </div>`;
  }

  return wordFileSummaryHtml(ws, withTrans, noTrans, true);
}

function phraseFileSummaryHtml(ps, withTrans, noTrans, showPhaseBreakdown = false) {
  const phasePart = showPhaseBreakdown
    ? `<p class="import-stats-lead import-stats-phase">
        Выражения с переводом — <strong>${withTrans}</strong><br />
        Без перевода — <strong>${noTrans}</strong>
      </p>`
    : "";
  return `
    <div class="import-stats import-stats-summary">
      <p class="import-stats-lead">
        <strong>${ps.total}</strong> ${pluralPhrases(ps.total)}:
        новых <strong>${ps.newCount}</strong> ·
        знаете <strong>${ps.knownCount}</strong> ·
        изучаете <strong>${ps.studyingCount}</strong>.
      </p>
      ${phasePart}
    </div>`;
}

function phraseStatsHtml() {
  const withTrans = newPhrasesWithTrans().length;
  const noTrans = newPhrasesNoTrans().length;
  const phase = session.ui.phrasesPhase;
  const ps = phraseSummary(session.phrases);

  if (phase === "complete" && ps.total > 0) {
    return phraseFileSummaryHtml(ps, withTrans, noTrans, false);
  }

  if (phase === "noTrans") {
    return `
      <div class="import-stats import-stats-summary">
        <p class="import-stats-lead import-stats-phase">
          Нашлось <strong>${noTrans}</strong> ${pluralPhrases(noTrans)} без перевода.
          Впишите вручную или отметьте «Знаю», если уже знаете.
        </p>
      </div>`;
  }

  return phraseFileSummaryHtml(ps, withTrans, noTrans, true);
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

function saveVocabularySnapshot(el, ctx) {
  const fields = readMetaFields(el, session.meta);
  const { sourceId } = resolveImportSource(ctx.state, session.meta, fields);
  if (!sourceId) return;

  setSourceVocabulary(ctx.state, sourceId, {
    words: session.words.map((w) => w.lemma),
    phrases: session.phrases.map((p) => p.text),
  });

  if (session.dict) {
    ensureSnapshotItems(ctx.state, sourceId, session.dict, session.phrasesDb);
  }
  ctx.save();
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

  if (sourceId) {
    setSourceVocabulary(ctx.state, sourceId, {
      words: session.words.map((w) => w.lemma),
      phrases: session.phrases.map((p) => p.text),
    });
    if (session.dict) {
      ensureSnapshotItems(ctx.state, sourceId, session.dict, session.phrasesDb);
    }
  }
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

function renderCommitted(el, ctx, { wordRes, phraseRes, label }) {
  const box = el.querySelector("#import-result");
  if (!box) return;

  const stats = getAppStats(ctx.state);
  const noTrans = stats.noTransWords + stats.noTransPhrases;
  const addedTotal = wordRes.added + wordRes.updated + phraseRes.added + phraseRes.updated;

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
        ${noTrans ? `<p class="import-done-hint c-missing">${noTrans} без перевода — дополните в «База знаний → Изучать» (фильтр «Без перевода»).</p>` : ""}
      </div>
      ${(noTrans || addedTotal) ? `
      <div class="import-done-actions">
        ${noTrans ? `<button type="button" id="import-go-knowledge" class="btn btn-sm">Дополнить переводы</button>` : ""}
        ${addedTotal ? `<button type="button" id="import-go-training" class="btn btn-sm outline">К тренировке</button>` : ""}
      </div>` : ""}
    </div>`;

  el.querySelector("#import-go-knowledge")?.addEventListener("click", () => {
    ctx.navigateTo?.("knowledge");
  });
  el.querySelector("#import-go-training")?.addEventListener("click", () => {
    ctx.navigateTo?.("training");
  });
}

function showError(el, msg) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;
  box.innerHTML = `<div class="import-error">${esc(msg)}</div>`;
}

// ---------- Library picker ----------

function emptyLibPicker() {
  return {
    step: "shows",
    showId: null,
    showEntry: null,
    showData: null,
    selected: new Set(),
    loading: false,
    error: "",
  };
}

async function openLibraryPicker(el, ctx) {
  libPicker = emptyLibPicker();
  libPicker.loading = true;
  session = null;
  swipeDetach = null;
  el.querySelector("#import-result").hidden = true;
  resetImportFileForm(el);
  renderLibraryPicker(el, ctx);

  try {
    const index = await getLibraryIndex();
    libPicker.index = index;
    libPicker.loading = false;
    if (index.loadError) {
      libPicker.error = "Не удалось загрузить data/library/index.json. Откройте приложение через локальный сервер из корня проекта (не двойным кликом по index.html).";
    } else if (!index.shows.length) {
      libPicker.error = "Библиотека пуста — положите файлы в data/library/ и обновите index.json.";
    }
  } catch (err) {
    libPicker.loading = false;
    libPicker.error = err.message || String(err);
  }
  renderLibraryPicker(el, ctx);
}

function renderLibraryPicker(el, ctx) {
  const box = el.querySelector("#import-library");
  if (!box || !libPicker) return;
  box.hidden = false;

  if (libPicker.loading) {
    box.innerHTML = `<div class="card card-padded"><p class="muted">Загрузка библиотеки…</p></div>`;
    return;
  }

  if (libPicker.error && libPicker.step === "shows") {
    box.innerHTML = `
      <div class="card card-padded lib-panel">
        <div class="lib-head">
          <h2 class="settings-heading">Библиотека сериалов</h2>
          <button type="button" class="btn btn-sm outline" id="lib-close">Закрыть</button>
        </div>
        <p class="settings-empty">${esc(libPicker.error)}</p>
      </div>`;
    box.querySelector("#lib-close")?.addEventListener("click", () => closeLibraryPicker(el));
    return;
  }

  if (libPicker.step === "shows") {
    renderLibraryShowList(el, ctx, box);
    return;
  }

  renderLibraryEpisodePicker(el, ctx, box);
}

function renderLibraryShowList(el, ctx, box) {
  const shows = libPicker.index?.shows || [];
  box.innerHTML = `
    <div class="card card-padded lib-panel">
      <div class="lib-head">
        <h2 class="settings-heading">Библиотека сериалов</h2>
        <button type="button" class="btn btn-sm outline" id="lib-close">Закрыть</button>
      </div>
      <p class="settings-hint">Готовые наборы с переводами — выберите сериал.</p>
      <div class="lib-shows">
        ${shows.length
    ? shows.map((s) => `
          <button type="button" class="lib-show card card-padded" data-show-id="${escAttr(s.id)}">
            <span class="lib-show-title">${esc(s.title)}</span>
            <span class="settings-hint">${s.seasons} сез · ${s.episodes} серий</span>
          </button>`).join("")
    : `<p class="settings-empty">Нет сериалов в библиотеке.</p>`}
      </div>
    </div>`;

  box.querySelector("#lib-close")?.addEventListener("click", () => closeLibraryPicker(el));
  box.querySelectorAll(".lib-show").forEach((btn) => {
    btn.addEventListener("click", () => selectLibraryShow(el, ctx, btn.dataset.showId));
  });
}

async function selectLibraryShow(el, ctx, showId) {
  libPicker.showId = showId;
  libPicker.showEntry = libPicker.index.shows.find((s) => s.id === showId) || null;
  libPicker.selected = new Set();
  libPicker.loading = true;
  libPicker.step = "episodes";
  renderLibraryPicker(el, ctx);

  try {
    libPicker.showData = await getLibraryShow(showId);
    libPicker.loading = false;
    if (!libPicker.showData) {
      libPicker.error = "Не удалось загрузить файл сериала.";
      libPicker.step = "shows";
    }
  } catch (err) {
    libPicker.loading = false;
    libPicker.error = err.message || String(err);
    libPicker.step = "shows";
  }
  renderLibraryPicker(el, ctx);
}

function renderLibraryEpisodePicker(el, ctx, box) {
  const show = libPicker.showData;
  const episodes = listShowEpisodes(show);
  const selected = libPicker.selected;
  const allSelected = episodes.length > 0 && episodes.every((ep) => selected.has(ep.key));

  const bySeason = new Map();
  for (const ep of episodes) {
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season).push(ep);
  }

  const seasonBlocks = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNum, eps]) => {
      const seasonAll = eps.every((ep) => selected.has(ep.key));
      return `
        <div class="lib-season">
          <div class="lib-season-head">
            <span class="lib-season-title">Сезон ${seasonNum}</span>
            <button type="button" class="btn btn-sm outline lib-season-all" data-season="${seasonNum}">
              ${seasonAll ? "Снять сезон" : "Весь сезон"}
            </button>
          </div>
          <div class="lib-episodes">
            ${eps.map((ep) => `
              <label class="lib-ep">
                <input type="checkbox" data-key="${escAttr(ep.key)}" ${selected.has(ep.key) ? "checked" : ""} />
                <span class="lib-ep-code">S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}</span>
                <span class="lib-ep-title">${esc(ep.title || "—")}</span>
                <span class="lib-ep-meta">${ep.words} сл · ${ep.phrases} фр</span>
              </label>`).join("")}
          </div>
        </div>`;
    }).join("");

  box.innerHTML = `
    <div class="card card-padded lib-panel lib-panel-episodes">
      <div class="lib-head">
        <button type="button" class="btn btn-sm outline" id="lib-back-shows">← Сериалы</button>
        <div class="lib-head-main">
          <h2 class="settings-heading">${esc(show?.title || libPicker.showEntry?.title || "Сериал")}</h2>
          <p class="settings-hint">${episodes.length} серий в наборе</p>
        </div>
        <button type="button" class="btn btn-sm outline" id="lib-close">Закрыть</button>
      </div>

      <div class="lib-bulk-row">
        <button type="button" class="btn btn-sm outline" id="lib-all-show">${allSelected ? "Снять всё" : "Весь сериал"}</button>
      </div>

      ${seasonBlocks || `<p class="settings-empty">В файле нет серий.</p>`}

      <div class="lib-actionbar">
        <span class="lib-actionbar-count">Выбрано: ${selected.size}</span>
        <button type="button" class="btn" id="lib-import-btn" ${selected.size ? "" : "disabled"}>
          Импортировать выбранные (${selected.size})
        </button>
      </div>
    </div>`;

  box.querySelector("#lib-close")?.addEventListener("click", () => closeLibraryPicker(el));
  box.querySelector("#lib-back-shows")?.addEventListener("click", () => {
    libPicker.step = "shows";
    libPicker.showData = null;
    libPicker.selected = new Set();
    renderLibraryPicker(el, ctx);
  });

  box.querySelector("#lib-all-show")?.addEventListener("click", () => {
    if (allSelected) episodes.forEach((ep) => selected.delete(ep.key));
    else episodes.forEach((ep) => selected.add(ep.key));
    renderLibraryEpisodePicker(el, ctx, box);
  });

  box.querySelectorAll(".lib-season-all").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seasonNum = +btn.dataset.season;
      const eps = episodes.filter((ep) => ep.season === seasonNum);
      const seasonAll = eps.every((ep) => selected.has(ep.key));
      if (seasonAll) eps.forEach((ep) => selected.delete(ep.key));
      else eps.forEach((ep) => selected.add(ep.key));
      renderLibraryEpisodePicker(el, ctx, box);
    });
  });

  box.querySelectorAll(".lib-ep input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.key;
      if (cb.checked) selected.add(key);
      else selected.delete(key);
      renderLibraryEpisodePicker(el, ctx, box);
    });
  });

  box.querySelector("#lib-import-btn")?.addEventListener("click", () => {
    if (!selected.size) return;
    runLibraryImport(el, ctx);
  });
}

function closeLibraryPicker(el) {
  libPicker = null;
  const box = el.querySelector("#import-library");
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
}

async function runLibraryImport(el, ctx) {
  if (!libPicker?.showData || !libPicker.selected.size) return;

  const btn = el.querySelector("#lib-import-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Импорт…";
  }

  try {
    const dict = await getDictionary();
    const phrasesDb = await getPhrases();
    const selections = [...libPicker.selected].map((key) => parseEpisodeKey(key));
    const result = importLibraryEpisodes(ctx.state, libPicker.showData, selections, { dict, phrasesDb });
    ctx.save();

    const showTitle = libPicker.showData.title || libPicker.showEntry?.title || "Сериал";
    const label = result.sources.length === 1
      ? `${showTitle} · ${result.sources[0].label}`
      : `${showTitle} · ${result.sources.length} серий`;

    closeLibraryPicker(el);
    renderLibraryCommitted(el, ctx, {
      wordRes: result.words,
      phraseRes: result.phrases,
      label,
      episodeCount: result.sources.length,
    });
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Импортировать выбранные (${libPicker.selected.size})`;
    }
    libPicker.error = err.message || String(err);
    renderLibraryPicker(el, ctx);
  }
}

function renderLibraryCommitted(el, ctx, { wordRes, phraseRes, label, episodeCount }) {
  const box = el.querySelector("#import-result");
  if (!box) return;

  const stats = getAppStats(ctx.state);
  const noTrans = stats.noTransWords + stats.noTransPhrases;
  const addedTotal = wordRes.added + wordRes.updated + phraseRes.added + phraseRes.updated;

  unbindScrollTop();

  box.hidden = false;
  box.innerHTML = `
    <div class="card card-padded import-section-gap import-committed">
      <div class="import-done import-done-prominent">
        Импорт из библиотеки: <b>${episodeCount}</b> ${episodeCount === 1 ? "серия" : "серий"}.
        Слова: <b>+${wordRes.added}</b> / обновлено <b>${wordRes.updated}</b>.
        Выражения: <b>+${phraseRes.added}</b> / обновлено <b>${phraseRes.updated}</b>.
        <br>${esc(label)}
        ${noTrans ? `<p class="import-done-hint c-missing">${noTrans} без перевода — дополните в «База знаний → Изучать».</p>` : ""}
      </div>
      ${(noTrans || addedTotal) ? `
      <div class="import-done-actions">
        ${noTrans ? `<button type="button" id="import-go-knowledge" class="btn btn-sm">Дополнить переводы</button>` : ""}
        ${addedTotal ? `<button type="button" id="import-go-training" class="btn btn-sm outline">К тренировке</button>` : ""}
      </div>` : ""}
    </div>`;

  el.querySelector("#import-go-knowledge")?.addEventListener("click", () => {
    ctx.navigateTo?.("knowledge");
  });
  el.querySelector("#import-go-training")?.addEventListener("click", () => {
    ctx.navigateTo?.("training");
  });
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

ensureImportConfirmModal();
