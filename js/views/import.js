import { parseFileContent, parseFileName } from "../core/parser.js";
import { analyzeText, analyzeSummary, analyzePhrases, phraseSummary } from "../core/analyzer.js";
import {
  addWords, addPhrases, addStopWord, addKnownLemma, addKnownPhrase,
  resolveImportSource,
} from "../db/database.js";
import { getDictionary, getFormsIndex, translate, translatorUrl } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";

let session = null;

export function renderImport(el, ctx) {
  session = null;

  el.innerHTML = `
    <h1 class="view-title">📥 Импорт</h1>
    <p class="view-subtitle">Загрузка субтитров (.srt) и книг (.txt).</p>

    <div class="import-upload">
      <label class="import-filelabel">
        <input type="file" id="import-file" accept=".srt,.txt" hidden />
        <span class="import-filebtn">Выбрать файл (.srt / .txt)</span>
      </label>
      <span id="import-filename" class="import-filename"></span>
    </div>

    <div id="import-meta" class="import-meta" hidden></div>
    <div id="import-result" class="import-result" hidden></div>
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
  session = { fileName: file.name, ext, text, meta, words: [], phrases: [], dict: null, phrasesDb: null };
  renderMeta(el, ctx, meta, text);
}

function renderMeta(el, ctx, meta, text) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;
  const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;

  const fields = meta.kind === "srt" ? `
    <h2 class="import-section-title">Распознано как сериал</h2>
    <div class="import-fields">
      <label>Сериал<input type="text" id="m-show" value="${esc(meta.show)}" /></label>
      <label>Сезон<input type="number" id="m-season" value="${meta.season ?? ""}" min="0" /></label>
      <label>Серия<input type="number" id="m-episode" value="${meta.episode ?? ""}" min="0" /></label>
      <label>Название серии<input type="text" id="m-eptitle" value="${esc(meta.episodeTitle)}" /></label>
    </div>` : `
    <h2 class="import-section-title">Распознано как книга</h2>
    <div class="import-fields">
      <label>Книга<input type="text" id="m-book" value="${esc(meta.book)}" /></label>
      <label>Глава<input type="number" id="m-chapter" value="${meta.chapter ?? ""}" min="0" /></label>
      <label>Название главы<input type="text" id="m-chtitle" value="${esc(meta.chapterTitle)}" /></label>
    </div>`;

  box.innerHTML = `
    ${fields}
    <div class="import-preview">
      <div class="import-preview-label">Текст (${text.length} символов):</div>
      <div class="import-preview-text">${esc(preview)}</div>
    </div>
    <button id="btn-analyze" class="import-btn-primary">Разобрать →</button>
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

function renderResult(el, ctx) {
  const box = el.querySelector("#import-result");
  box.hidden = false;

  const wordRows = session.words.map((w, i) => wordRowHtml(w, i)).join("");
  const phraseRows = session.phrases.map((p, i) => phraseRowHtml(p, i)).join("");

  box.innerHTML = `
    <h2 class="import-section-title">Слова</h2>
    <div id="import-word-summary" class="import-summary"></div>
    <div class="import-table-wrap">
      <table class="import-table">
        <thead><tr>
          <th></th><th>Лемма</th><th>Переводы</th><th>Формы</th><th>Кол-во</th><th>Статус</th><th>Действия</th>
        </tr></thead>
        <tbody id="import-word-tbody">${wordRows}</tbody>
      </table>
    </div>

    <h2 class="import-section-title import-section-gap">Выражения</h2>
    <div id="import-phrase-summary" class="import-summary"></div>
    <div class="import-table-wrap">
      <table class="import-table">
        <thead><tr>
          <th></th><th>Выражение</th><th>Переводы</th><th>Кол-во</th><th>Статус</th><th>Действия</th>
        </tr></thead>
        <tbody id="import-phrase-tbody">${phraseRows || `<tr><td colspan="6" class="empty-row">Выражения не найдены</td></tr>`}</tbody>
      </table>
    </div>

    <button id="btn-commit" class="import-btn-primary">Импортировать выбранные</button>
    <div id="import-done" class="import-done" hidden></div>
  `;

  updateSummaries(el);
  bindWordEvents(el, ctx);
  bindPhraseEvents(el, ctx);
  box.querySelector("#btn-commit").addEventListener("click", () => commit(el, ctx));
}

function translationCell(item, i, kind) {
  const hasAuto = item.translations?.length > 0;
  const label = kind === "word" ? item.lemma : item.text;
  if (hasAuto) {
    return `<span class="col-trans">${esc(item.translations.join(", "))}</span>`;
  }
  return `
    <div class="trans-missing">
      <span class="tag tag-missing">нет перевода</span>
      <input type="text" class="trans-input" data-kind="${kind}" data-i="${i}" placeholder="вписать вручную"
        value="${esc(item.manualTranslation)}" />
      <a class="trans-link" href="${translatorUrl(label)}" target="_blank" rel="noopener">↗</a>
    </div>`;
}

function wordRowHtml(w, i) {
  const tag = w.known ? `<span class="tag tag-known">знаю</span>`
            : w.stop  ? `<span class="tag tag-stop">стоп</span>`
            : `<span class="tag tag-new">новое</span>`;
  return `
    <tr data-kind="word" data-i="${i}" class="${w.included ? "" : "row-excluded"}">
      <td><input type="checkbox" data-kind="word" data-i="${i}" ${w.included ? "checked" : ""} /></td>
      <td>${esc(w.lemma)}</td>
      <td class="col-trans-cell">${translationCell(w, i, "word")}</td>
      <td class="col-forms">${esc(w.forms.join(", "))}</td>
      <td class="col-count">${w.count}</td>
      <td>${tag}</td>
      <td class="col-actions">
        <button class="row-btn row-btn-known" data-act="known" data-kind="word" data-i="${i}">✓ Знаю</button>
        <button class="row-btn row-btn-stop" data-act="stop" data-kind="word" data-i="${i}">🗑 Мусор</button>
      </td>
    </tr>`;
}

function phraseRowHtml(p, i) {
  const tag = p.known ? `<span class="tag tag-known">знаю</span>`
            : `<span class="tag tag-new">новое</span>`;
  return `
    <tr data-kind="phrase" data-i="${i}" class="${p.included ? "" : "row-excluded"}">
      <td><input type="checkbox" data-kind="phrase" data-i="${i}" ${p.included ? "checked" : ""} /></td>
      <td>${esc(p.text)}</td>
      <td class="col-trans-cell">${translationCell(p, i, "phrase")}</td>
      <td class="col-count">${p.count}</td>
      <td>${tag}</td>
      <td class="col-actions">
        <button class="row-btn row-btn-known" data-act="known" data-kind="phrase" data-i="${i}">✓ Знаю</button>
      </td>
    </tr>`;
}

function updateSummaries(el) {
  const liveWords = session.words.filter((w) => !w.removed);
  const ws = analyzeSummary(liveWords);
  const noTransW = liveWords.filter((w) => !resolveTranslations(w).length).length;
  el.querySelector("#import-word-summary").innerHTML = `
    Всего: <b>${ws.total}</b> ·
    Новых: <b class="c-new">${ws.newCount}</b> ·
    Знаю: <b class="c-known">${ws.knownCount}</b> ·
    Стоп: <b class="c-stop">${ws.stopCount}</b> ·
    Без перевода: <b class="c-missing">${noTransW}</b>`;

  const livePhrases = session.phrases.filter((p) => !p.removed);
  const ps = phraseSummary(livePhrases);
  const noTransP = livePhrases.filter((p) => !resolveTranslations(p).length).length;
  el.querySelector("#import-phrase-summary").innerHTML = `
    Всего: <b>${ps.total}</b> ·
    Новых: <b class="c-new">${ps.newCount}</b> ·
    Знаю: <b class="c-known">${ps.knownCount}</b> ·
    Без перевода: <b class="c-missing">${noTransP}</b>`;
}

function bindWordEvents(el, ctx) {
  const tbody = el.querySelector("#import-word-tbody");
  if (!tbody) return;

  tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.words[i].included = cb.checked;
      cb.closest("tr").classList.toggle("row-excluded", !cb.checked);
    });
  });

  tbody.querySelectorAll(".trans-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      session.words[+inp.dataset.i].manualTranslation = inp.value;
      updateSummaries(el);
    });
  });

  tbody.querySelectorAll(".row-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleRowAction(el, ctx, btn, "word"));
  });
}

function bindPhraseEvents(el, ctx) {
  const tbody = el.querySelector("#import-phrase-tbody");
  if (!tbody) return;

  tbody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = +cb.dataset.i;
      session.phrases[i].included = cb.checked;
      cb.closest("tr").classList.toggle("row-excluded", !cb.checked);
    });
  });

  tbody.querySelectorAll(".trans-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      session.phrases[+inp.dataset.i].manualTranslation = inp.value;
      updateSummaries(el);
    });
  });

  tbody.querySelectorAll(".row-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleRowAction(el, ctx, btn, "phrase"));
  });
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
  btn.closest("tr")?.remove();
  updateSummaries(el);
}

function resolveTranslations(item) {
  const auto = item.translations || [];
  const manual = String(item.manualTranslation || "").trim();
  if (manual) return [manual, ...auto].slice(0, 3);
  return auto;
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
  done.innerHTML = `✅ Импортировано.
    Слова: <b>+${wordRes.added}</b> / обновлено <b>${wordRes.updated}</b>.
    Выражения: <b>+${phraseRes.added}</b> / обновлено <b>${phraseRes.updated}</b>.
    Источник: <b>${esc(label || "—")}</b>
    ${noTrans ? `<br><span class="c-missing">⚠ ${noTrans} без перевода — можно дополнить в разделах «Слова» / «Выражения».</span>` : ""}`;
}

function showError(el, msg) {
  const box = el.querySelector("#import-meta");
  box.hidden = false;
  box.innerHTML = `<div class="import-error">⚠️ ${esc(msg)}</div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
