import {
  getKnowledgeWords,
  getKnowledgePhrases,
  getStopListWords,
  returnWordToStudy,
  returnPhraseToStudy,
  returnStopWordToStudy,
  excludeWordFromImport,
  excludePhraseFromImport,
  addStopWord,
  removeStopWord,
  getAppStats,
} from "../db/database.js";
import { countDue } from "../core/srs.js";
import { getDictionary, translate } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import { mountWordsPanel } from "./study-words.js";
import { mountPhrasesPanel } from "./study-phrases.js";

let section = "studying";
let subTab = "words";
let query = "";
let wordsPanel = null;
let phrasesPanel = null;

export function renderKnowledge(el, ctx) {
  section = "studying";
  subTab = "words";
  query = "";
  wordsPanel = null;
  phrasesPanel = null;
  draw(el, ctx);
}

function draw(el, ctx) {
  const stats = getAppStats(ctx.state);
  const due = countDue(ctx.state);
  const stopWords = filterStopItems(getStopListWords(ctx.state), query);

  const learnedWords = filterItems(
    getKnowledgeWords(ctx.state).filter((w) => !w.inStopList),
    query,
    (x) => x.lemma
  );
  const learnedPhrases = filterItems(getKnowledgePhrases(ctx.state), query, (x) => x.text);

  const studyingWordsCount = stats.activeWords;
  const studyingPhrasesCount = stats.activePhrases;
  const stopCount = (ctx.state.settings?.stopList || []).length;

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">База знаний</h1>
    <p class="view-subtitle">Слова и выражения, выученное, стоп-лист и статистика.</p>

    <section class="card card-padded settings-card kb-stats">
      <h2 class="settings-heading">База</h2>
      <div class="settings-stats">
        <div class="stat-item"><span class="stat-num">${stats.words}</span> слов</div>
        <div class="stat-item"><span class="stat-num">${stats.phrases}</span> выражений</div>
        <div class="stat-item"><span class="stat-num">${stats.learnedWords + stats.learnedPhrases}</span> выучено</div>
        <div class="stat-item"><span class="stat-num">${due}</span> к повторению</div>
      </div>
    </section>

    <div class="tabs kb-section-tabs" id="kb-section-tabs">
      <button type="button" class="tab-btn${section === "studying" ? " active" : ""}" data-section="studying">На изучении</button>
      <button type="button" class="tab-btn${section === "learned" ? " active" : ""}" data-section="learned">Выучено</button>
      <button type="button" class="tab-btn${section === "stoplist" ? " active" : ""}" data-section="stoplist">Стоп-лист</button>
    </div>

    ${section === "stoplist" ? stopListToolbar() : listToolbar()}

    <div class="list-summary" id="kb-summary">${summaryHtml(section, subTab, {
      studyingWordsCount,
      studyingPhrasesCount,
      learnedWordsCount: learnedWords.length,
      learnedPhrasesCount: learnedPhrases.length,
      stopCount,
    })}</div>

    <div id="kb-content"></div>
    </div>
  `;

  const content = el.querySelector("#kb-content");

  el.querySelector("#k-search")?.addEventListener("input", (e) => {
    query = e.target.value;
    if (section === "studying") {
      if (subTab === "words" && wordsPanel) wordsPanel.setQuery(query);
      if (subTab === "phrases" && phrasesPanel) phrasesPanel.setQuery(query);
      updateSummary(el, section, subTab, {
        studyingWordsCount: wordsPanel?.getCount() ?? studyingWordsCount,
        studyingPhrasesCount: phrasesPanel?.getCount() ?? studyingPhrasesCount,
      });
    } else {
      draw(el, ctx);
    }
  });

  el.querySelectorAll("#kb-section-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      section = btn.dataset.section;
      if (section === "stoplist") subTab = "words";
      draw(el, ctx);
    });
  });

  el.querySelectorAll("#kb-subtabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      subTab = btn.dataset.tab;
      draw(el, ctx);
    });
  });

  el.querySelector("#kb-add")?.addEventListener("click", () => {
    if (subTab === "words") wordsPanel?.openAddForm();
    else phrasesPanel?.openAddForm();
  });

  if (section === "studying") {
    mountStudying(content, ctx, el);
  } else if (section === "learned") {
    content.innerHTML = subTab === "words"
      ? learnedWordsTable(learnedWords)
      : learnedPhrasesTable(learnedPhrases);
    bindLearnedActions(el, ctx);
    enrichLearnedTranslations(ctx, el);
  } else {
    content.innerHTML = stopListTable(stopWords);
    bindStopListActions(el, ctx);
  }
}

function mountStudying(content, ctx, rootEl) {
  const onChange = () => {
    const stats = getAppStats(ctx.state);
    updateSummary(rootEl, section, subTab, {
      studyingWordsCount: stats.activeWords,
      studyingPhrasesCount: stats.activePhrases,
    });
  };

  if (subTab === "words") {
    wordsPanel = mountWordsPanel(content, ctx, { prefix: "kw", query, onChange });
  } else {
    phrasesPanel = mountPhrasesPanel(content, ctx, { prefix: "kp", query, onChange });
  }
}

function listToolbar() {
  return `
    <div class="list-toolbar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск…" value="${esc(query)}" />
      <div class="tabs" id="kb-subtabs">
        <button type="button" class="tab-btn${subTab === "words" ? " active" : ""}" data-tab="words">Слова</button>
        <button type="button" class="tab-btn${subTab === "phrases" ? " active" : ""}" data-tab="phrases">Выражения</button>
      </div>
      ${section === "studying" ? `<button type="button" id="kb-add" class="btn btn-sm">+ Добавить</button>` : ""}
    </div>`;
}

function stopListToolbar() {
  return `
    <div class="list-toolbar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск по слову или переводу…" value="${esc(query)}" />
      <button type="button" id="stop-add-open" class="btn btn-sm">+ Добавить</button>
    </div>
    <div id="stop-add-form" class="list-add-form" hidden>
      <input type="text" id="stop-new" placeholder="Слово (english)" />
      <button type="button" id="stop-add-btn" class="btn btn-sm">Сохранить</button>
      <button type="button" id="stop-add-cancel" class="btn secondary btn-sm">Отмена</button>
    </div>
    <p id="stop-msg" class="settings-msg"></p>`;
}

function summaryHtml(section, tab, counts) {
  if (section === "studying") {
    const n = tab === "words" ? counts.studyingWordsCount : counts.studyingPhrasesCount;
    return `${tab === "words" ? "Слов" : "Выражений"} на изучении: <b>${n}</b>`;
  }
  if (section === "learned") {
    const n = tab === "words" ? counts.learnedWordsCount : counts.learnedPhrasesCount;
    return `${tab === "words" ? "Слов" : "Выражений"} выучено: <b>${n}</b>`;
  }
  return `В стоп-листе: <b>${counts.stopCount}</b> слов`;
}

function updateSummary(rootEl, sec, tab, partial) {
  const summary = rootEl.querySelector("#kb-summary");
  if (!summary) return;
  summary.innerHTML = summaryHtml(sec, tab, {
    studyingWordsCount: partial.studyingWordsCount ?? 0,
    studyingPhrasesCount: partial.studyingPhrasesCount ?? 0,
    learnedWordsCount: 0,
    learnedPhrasesCount: 0,
    stopCount: 0,
  });
}

function learnedWordsTable(words) {
  if (!words.length) {
    return `<div class="card list-card"><div class="list-empty">Список слов пуст</div></div>`;
  }
  return `
    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table">
          <thead><tr><th>Слово</th><th>Переводы</th><th></th></tr></thead>
          <tbody>${words.map((w) => learnedWordRow(w)).join("")}</tbody>
        </table>
      </div>
    </div>`;
}

function learnedPhrasesTable(phrases) {
  if (!phrases.length) {
    return `<div class="card list-card"><div class="list-empty">Список выражений пуст</div></div>`;
  }
  return `
    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table">
          <thead><tr><th>Выражение</th><th>Переводы</th><th></th></tr></thead>
          <tbody>${phrases.map((p) => learnedPhraseRow(p)).join("")}</tbody>
        </table>
      </div>
    </div>`;
}

function stopListTable(entries) {
  if (!entries.length) {
    return `<div class="card list-card"><div class="list-empty">Стоп-лист пуст. Добавьте слова вручную или при импорте.</div></div>`;
  }
  return `
    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table">
          <thead><tr><th>Слово</th><th>Переводы</th><th></th></tr></thead>
          <tbody>${entries.map((e) => stopWordRow(e)).join("")}</tbody>
        </table>
      </div>
    </div>`;
}

function learnedWordRow(entry) {
  const { lemma, word } = entry;
  const trans = word?.translations?.length ? word.translations.join(", ") : "—";
  const inCards = word ? `<span class="tag tag-manual">в карточках</span>` : "";

  return `
    <tr data-lemma="${escAttr(lemma)}">
      <td><strong>${esc(lemma)}</strong><br><span class="tag tag-known">выучено</span> ${inCards}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="return-word" data-lemma="${escAttr(lemma)}" title="Вернуть в изучение">↩</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="exclude-word" data-lemma="${escAttr(lemma)}" title="В стоп-лист">🚫</button>
      </td>
    </tr>`;
}

function learnedPhraseRow(entry) {
  const { text, phrase } = entry;
  const trans = phrase?.translations?.length ? phrase.translations.join(", ") : "—";

  return `
    <tr data-text="${escAttr(text)}">
      <td><strong>${esc(text)}</strong><br><span class="tag tag-known">выучено</span>
        ${phrase ? `<span class="tag tag-manual">в карточках</span>` : ""}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="return-phrase" data-text="${escAttr(text)}" title="Вернуть в изучение">↩</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="exclude-phrase" data-text="${escAttr(text)}" title="Исключить из импорта">🚫</button>
      </td>
    </tr>`;
}

function stopWordRow(entry) {
  const { lemma, word } = entry;
  const trans = word?.translations?.length ? word.translations.join(", ") : "—";
  const inCards = word ? `<span class="tag tag-manual">в карточках</span>` : "";

  return `
    <tr data-lemma="${escAttr(lemma)}">
      <td><strong>${esc(lemma)}</strong><br><span class="tag tag-stop">стоп</span> ${inCards}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="return-stop-word" data-lemma="${escAttr(lemma)}" title="Вернуть в изучение">↩</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="remove-stop-word" data-lemma="${escAttr(lemma)}" title="Убрать из стоп-листа">✕</button>
      </td>
    </tr>`;
}

async function enrichLearnedTranslations(ctx, el) {
  try {
    const dict = await getDictionary();
    const phrasesDb = await getPhrases();
    let changed = false;

    for (const w of ctx.state.words || []) {
      if (!w.learned || (w.translations?.length)) continue;
      const trans = translate(w.lemma, dict);
      if (trans.length) {
        w.translations = trans;
        changed = true;
      }
    }

    for (const p of ctx.state.phrases || []) {
      if (!p.learned || (p.translations?.length)) continue;
      const trans = translatePhrase(p.text, phrasesDb);
      if (trans.length) {
        p.translations = trans;
        changed = true;
      }
    }

    if (changed) {
      ctx.save();
      draw(el, ctx);
    }
  } catch (err) {
    console.warn("Не удалось подставить переводы для выученного:", err);
  }
}

function bindLearnedActions(el, ctx) {
  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "return-word") {
        if (!confirm(`Вернуть «${btn.dataset.lemma}» в изучение?`)) return;
        returnWordToStudy(ctx.state, btn.dataset.lemma);
      } else if (act === "exclude-word") {
        if (!confirm(`Добавить «${btn.dataset.lemma}» в стоп-лист?`)) return;
        excludeWordFromImport(ctx.state, btn.dataset.lemma);
      } else if (act === "return-phrase") {
        if (!confirm(`Вернуть «${btn.dataset.text}» в изучение?`)) return;
        returnPhraseToStudy(ctx.state, btn.dataset.text);
      } else if (act === "exclude-phrase") {
        excludePhraseFromImport(ctx.state, btn.dataset.text);
      }
      ctx.save();
      draw(el, ctx);
    });
  });
}

function bindStopListActions(el, ctx) {
  el.querySelector("#stop-add-open")?.addEventListener("click", () => {
    const form = el.querySelector("#stop-add-form");
    if (form) form.hidden = false;
    el.querySelector("#stop-new")?.focus();
  });

  el.querySelector("#stop-add-cancel")?.addEventListener("click", () => {
    const form = el.querySelector("#stop-add-form");
    if (form) form.hidden = true;
    const inp = el.querySelector("#stop-new");
    if (inp) inp.value = "";
  });

  el.querySelector("#stop-add-btn")?.addEventListener("click", () => {
    const inp = el.querySelector("#stop-new");
    const word = inp?.value.trim();
    if (!word) return;
    if (addStopWord(ctx.state, word)) {
      ctx.save();
      inp.value = "";
      el.querySelector("#stop-add-form").hidden = true;
      flashStop(el, `«${word}» добавлено в стоп-лист`);
      draw(el, ctx);
    } else {
      flashStop(el, "Слово уже в стоп-листе", true);
    }
  });

  el.querySelector("#stop-new")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.querySelector("#stop-add-btn")?.click();
  });

  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      const lemma = btn.dataset.lemma;
      if (act === "return-stop-word") {
        if (!confirm(`Вернуть «${lemma}» в изучение?`)) return;
        returnStopWordToStudy(ctx.state, lemma);
      } else if (act === "remove-stop-word") {
        if (!confirm(`Убрать «${lemma}» из стоп-листа? Слово снова может появиться при импорте.`)) return;
        removeStopWord(ctx.state, lemma);
      }
      ctx.save();
      draw(el, ctx);
    });
  });
}

function flashStop(el, text, isError = false) {
  const msg = el.querySelector("#stop-msg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = `settings-msg ${isError ? "settings-msg-err" : "settings-msg-ok"}`;
}

function filterItems(items, q, getKey) {
  const s = q.toLowerCase().trim();
  if (!s) return items;
  return items.filter((item) => {
    const key = getKey(item).toLowerCase();
    if (key.includes(s)) return true;
    const obj = item.word || item.phrase;
    return (obj?.translations || []).some((t) => t.toLowerCase().includes(s));
  });
}

function filterStopItems(items, q) {
  return filterItems(items, q, (x) => x.lemma);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
