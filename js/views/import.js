import { parseFileContent, parseFileName } from "../core/parser.js";
import { analyzeText, analyzeSummary, analyzePhrases, phraseSummary } from "../core/analyzer.js";
import {
  addWords, addPhrases, addStopWord, addKnownLemma, addKnownPhrase,
  resolveImportSource,
} from "../db/database.js";
import { getDictionary, getFormsIndex, translate, translatorUrl } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import { attachSwipeCard } from "../ui/swipe-card.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";

let session = null;
let swipeDetach = null;

const defaultUi = () => ({ tab: "words", view: "cards", stackIndex: 0 });

export function renderImport(el, ctx) {
  session = null;
  swipeDetach = null;

  el.innerHTML = `
    <div class="page">
      <h1 class="view-title">Импорт текста</h1>
      <p class="view-subtitle">Загрузите субтитры (.srt) или текст главы (.txt).</p>

      <div class="card card-padded">
        <div class="import-upload">
          <label class="import-filelabel">
            <input type="file" id="import-file" accept=".srt,.txt" hidden />
            <span class="import-filebtn btn btn-lg">Выбрать файл</span>
          </label>
          <span id="import-filename" class="import-filename">.srt или .txt</span>
        </div>
        <div id="import-meta" class="import-meta" hidden></div>
      </div>

      <div id="import-result" class="import-result" hidden></div>
    </div>
  `;

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
  renderMeta(el, ctx, meta, text);
}

function renderMeta(el, ctx, meta, text) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;
  const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;

  const fields = meta.kind === "srt" ? `
    <div class="form-grid">
      <label class="field-label">Сериал<input type="text" id="m-show" value="${esc(meta.show)}" /></label>
      <label class="field-label">Сезон<input type="number" id="m-season" value="${meta.season ?? ""}" min="0" /></label>
      <label class="field-label">Серия<input type="number" id="m-episode" value="${meta.episode ?? ""}" min="0" /></label>
      <label class="field-label">Название серии<input type="text" id="m-eptitle" value="${esc(meta.episodeTitle)}" /></label>
    </div>` : `
    <div class="form-grid">
      <label class="field-label">Книга<input type="text" id="m-book" value="${esc(meta.book)}" /></label>
      <label class="field-label">Глава<input type="number" id="m-chapter" value="${meta.chapter ?? ""}" min="0" /></label>
      <label class="field-label">Название главы<input type="text" id="m-chtitle" value="${esc(meta.chapterTitle)}" /></label>
    </div>`;

  box.innerHTML = `
    <p class="import-section-title">${meta.kind === "srt" ? "Распознано как сериал" : "Распознано как книга"}</p>
    ${fields}
    <div class="import-preview">
      <div class="import-preview-label">Текст (${text.length} символов)</div>
      <div class="import-preview-text">${esc(preview)}</div>
    </div>
    <button id="btn-analyze" class="btn mt-16">Разобрать →</button>
  `;

  box.querySelector("#btn-analyze").addEventListener("click", () => runAnalyze(el, ctx));
}

async function runAnalyze(el, ctx) {
  const btn = el.querySelector("#btn-analyze");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Загрузка словаря…";
  }

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
    renderResult(el, ctx);
  } catch (err) {
    showError(el, "Ошибка при разборе: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Разобрать →";
    }
  }
}

function liveWords() {
  return session.words.filter((w) => !w.removed);
}

function livePhrases() {
  return session.phrases.filter((p) => !p.removed);
}

function renderResult(el, ctx) {
  const box = el.querySelector("#import-result");
  box.hidden = false;
  const wc = liveWords().length;
  const pc = livePhrases().length;
  const { tab, view } = session.ui;

  box.innerHTML = `
    <div class="card card-padded import-section-gap">
      <div class="import-toolbar">
        <div class="tabs" role="tablist">
          <button type="button" class="tab-btn ${tab === "words" ? "active" : ""}" data-tab="words">Слова (${wc})</button>
          <button type="button" class="tab-btn ${tab === "phrases" ? "active" : ""}" data-tab="phrases">Фразы (${pc})</button>
        </div>
        ${tab === "words" ? `
        <div class="tabs">
          <button type="button" class="tab-btn ${view === "cards" ? "active" : ""}" data-view="cards">Карточки</button>
          <button type="button" class="tab-btn ${view === "list" ? "active" : ""}" data-view="list">Список</button>
        </div>` : ""}
      </div>
      <div id="import-panel"></div>
      <div class="row mt-16">
        <button id="btn-commit" class="btn">Импортировать выбранные</button>
      </div>
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
  box.querySelector("#btn-commit").addEventListener("click", () => commit(el, ctx));
}

function renderPanel(el, ctx) {
  if (swipeDetach) {
    swipeDetach();
    swipeDetach = null;
  }

  const panel = el.querySelector("#import-panel");
  if (!panel) return;

  if (session.ui.tab === "phrases") {
    panel.innerHTML = renderPhrasesPanel(el);
  bindPhraseEvents(el, ctx);
  bindImportTransChips(el);
  return;
}

  panel.innerHTML = `
    ${wordStatsHtml()}
    ${session.ui.view === "cards" ? renderWordCards(el, ctx) : renderWordList(el)}
  `;

  if (session.ui.view === "cards") {
    bindWordCards(el, ctx);
  } else {
    bindWordListEvents(el, ctx);
  }
  bindImportTransChips(el);
}

function wordStatsHtml() {
  const live = liveWords();
  const ws = analyzeSummary(live);
  const noTrans = live.filter((w) => !resolveTranslations(w).length).length;
  return `
    <div class="import-stats">
      <span class="stat-chip">Всего <strong>${ws.total}</strong></span>
      <span class="stat-chip stat-chip-success">Новых <strong>${ws.newCount}</strong></span>
      <span class="stat-chip">Знаю <strong>${ws.knownCount}</strong></span>
      <span class="stat-chip stat-chip-danger">Стоп <strong>${ws.stopCount}</strong></span>
      ${noTrans ? `<span class="stat-chip stat-chip-warning">Без перевода <strong>${noTrans}</strong></span>` : ""}
    </div>`;
}

function phraseStatsHtml() {
  const live = livePhrases();
  const ps = phraseSummary(live);
  const noTrans = live.filter((p) => !resolveTranslations(p).length).length;
  return `
    <div class="import-stats">
      <span class="stat-chip">Всего <strong>${ps.total}</strong></span>
      <span class="stat-chip stat-chip-success">Новых <strong>${ps.newCount}</strong></span>
      <span class="stat-chip">Знаю <strong>${ps.knownCount}</strong></span>
      ${noTrans ? `<span class="stat-chip stat-chip-warning">Без перевода <strong>${noTrans}</strong></span>` : ""}
    </div>`;
}

function renderWordCards(el, ctx) {
  const live = liveWords();
  if (!live.length) {
    return `<p class="list-empty">Все слова разобраны</p>`;
  }

  if (session.ui.stackIndex >= live.length) session.ui.stackIndex = 0;
  const w = live[session.ui.stackIndex];
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
  const live = liveWords();
  if (!live.length) return;

  const swipeEl = el.querySelector("#import-swipe");
  if (swipeEl) {
    const w = live[session.ui.stackIndex];
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
  const live = liveWords();
  if (!live.length) return `<p class="list-empty">Нет слов для импорта</p>`;

  const allIncluded = live.length > 0 && live.every((w) => w.included);

  return `
    <div class="bulk-bar">
      <label><input type="checkbox" id="import-all-words" ${allIncluded ? "checked" : ""} /> Все</label>
      <span class="import-row-meta">Выбрано: ${live.filter((w) => w.included).length}</span>
    </div>
    <div class="import-rows" id="import-word-rows">
      ${live.map((w) => wordRowCard(w, session.words.indexOf(w))).join("")}
    </div>`;
}

function wordRowCard(w, i) {
  const tag = w.known ? `<span class="tag tag-known">знаю</span>`
    : w.stop ? `<span class="tag tag-stop">стоп</span>`
    : `<span class="tag tag-new">новое</span>`;
  const forms = (w.forms || []).slice(0, 5).map((f) => `<span class="chip">${esc(f)}</span>`).join("");

  return `
    <div class="import-row ${w.included ? "" : "row-excluded"}" data-kind="word" data-i="${i}">
      <div class="import-row-main">
        <input type="checkbox" data-kind="word" data-i="${i}" ${w.included ? "checked" : ""} />
        <div>
          <div class="import-row-title">${esc(w.lemma)} <span class="import-row-meta">×${w.count}</span> ${tag}</div>
          <div>${forms}</div>
        </div>
      </div>
      <div class="import-row-trans">${translationCell(w, i, "word")}</div>
      <div class="import-row-actions">
        <button type="button" class="btn outline btn-sm row-btn-known" data-act="known" data-kind="word" data-i="${i}">Знаю</button>
        <button type="button" class="btn outline btn-sm row-btn-stop" data-act="stop" data-kind="word" data-i="${i}">Стоп</button>
      </div>
    </div>`;
}

function bindWordListEvents(el, ctx) {
  el.querySelector("#import-all-words")?.addEventListener("change", (e) => {
    const val = e.target.checked;
    liveWords().forEach((w) => { w.included = val; });
    renderPanel(el, ctx);
  });

  el.querySelector("#import-word-rows")?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.words[i].included = cb.checked;
      cb.closest(".import-row")?.classList.toggle("row-excluded", !cb.checked);
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

function renderPhrasesPanel(el) {
  const live = livePhrases();
  if (!live.length) {
    return `${phraseStatsHtml()}<p class="list-empty">Выражения не найдены</p>`;
  }

  return `
    ${phraseStatsHtml()}
    <div class="import-rows" id="import-phrase-rows">
      ${live.map((p) => phraseRowCard(p, session.phrases.indexOf(p))).join("")}
    </div>`;
}

function phraseRowCard(p, i) {
  const tag = p.known ? `<span class="tag tag-known">знаю</span>` : `<span class="tag tag-new">новое</span>`;
  return `
    <div class="import-row ${p.included ? "" : "row-excluded"}" data-kind="phrase" data-i="${i}">
      <div class="import-row-main">
        <input type="checkbox" data-kind="phrase" data-i="${i}" ${p.included ? "checked" : ""} />
        <div>
          <div class="import-row-title">${esc(p.text)}</div>
          <div class="import-row-meta">×${p.count} ${tag}</div>
        </div>
      </div>
      <div class="import-row-trans">${translationCell(p, i, "phrase")}</div>
      <div class="import-row-actions">
        <button type="button" class="btn outline btn-sm row-btn-known" data-act="known" data-kind="phrase" data-i="${i}">Знаю</button>
      </div>
    </div>`;
}

function bindPhraseEvents(el, ctx) {
  el.querySelector("#import-phrase-rows")?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.phrases[i].included = cb.checked;
      cb.closest(".import-row")?.classList.toggle("row-excluded", !cb.checked);
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
    if (kind === "word") addKnownLemma(ctx.state, item.lemma);
    else addKnownPhrase(ctx.state, item.text);
  } else if (act === "stop" && kind === "word") {
    addStopWord(ctx.state, item.lemma);
  }
  ctx.save();

  item.removed = true;
  item.included = false;
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
  const chosenWords = session.words.filter((w) => w.included && !w.removed);
  const chosenPhrases = session.phrases.filter((p) => p.included && !p.removed);
  if (chosenWords.length === 0 && chosenPhrases.length === 0) {
    return alert("Не выбрано ни одного элемента.");
  }

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

  const noTrans = [...chosenWords, ...chosenPhrases].filter((x) => !resolveTranslations(x).length).length;

  const done = el.querySelector("#import-done");
  done.hidden = false;
  done.innerHTML = `Импортировано.
    Слова: <b>+${wordRes.added}</b> / обновлено <b>${wordRes.updated}</b>.
    Выражения: <b>+${phraseRes.added}</b> / обновлено <b>${phraseRes.updated}</b>.
    Источник: <b>${esc(label || "—")}</b>
    ${noTrans ? `<br><span class="c-missing">${noTrans} без перевода — дополните в «Слова» / «Выражения».</span>` : ""}`;
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
