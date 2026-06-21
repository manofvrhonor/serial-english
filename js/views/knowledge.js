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
  purgeWord,
  repairStopListTranslations,
  getAppStats,
  addWordManual,
  addPhraseManual,
  addKnownWordFromImport,
  addKnownPhraseFromImport,
} from "../db/database.js";
import { getDictionary, translate } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260621";
import { btnReturnStudy, btnStopList, btnDeleteWord, btnRemove } from "../ui/action-icons.js";
import { countTrainingItems } from "../core/srs.js";
import { mountWordsPanel } from "./study-words.js?v=20260621";
import { mountPhrasesPanel } from "./study-phrases.js?v=20260621";
import { bindScrollTop } from "../ui/scroll-top.js";

const KB_FILTERS = [
  { id: "known", label: "Выучено", cls: "filter-tab-known" },
  { id: "studying", label: "Изучать", cls: "filter-tab-studying" },
  { id: "stop", label: "Стоп", cls: "filter-tab-stop" },
  { id: "noTrans", label: "Без перевода", cls: "filter-tab-notrans" },
];

let filter = "studying";
let subTab = "words";
let query = "";
let wordsPanel = null;
let phrasesPanel = null;
let kbAddModalReady = false;
let kbAddPageEl = null;
let kbAddCtx = null;

export function renderKnowledge(el, ctx) {
  filter = "studying";
  subTab = "words";
  query = "";
  wordsPanel = null;
  phrasesPanel = null;
  draw(el, ctx);
}

function getKbStats(ctx) {
  const baseStats = getAppStats(ctx.state);
  return {
    ...baseStats,
    dueWords: countTrainingItems(ctx.state, { content: "words", direction: "both", dueOnly: true }),
    duePhrases: countTrainingItems(ctx.state, { content: "phrases", direction: "both", dueOnly: true }),
  };
}

function getKbTagStats(ctx, tab) {
  const stats = getAppStats(ctx.state);
  if (tab === "words") {
    const stop = getStopListWords(ctx.state).length;
    return {
      studying: Math.max(0, stats.studyingWords - stats.noTransWords),
      known: stats.learnedWords,
      stop,
      noTrans: stats.noTransWords,
    };
  }
  return {
    studying: Math.max(0, stats.studyingPhrases - stats.noTransPhrases),
    known: stats.learnedPhrases,
    stop: 0,
    noTrans: stats.noTransPhrases,
  };
}

function buildTagParts(tagStats) {
  const parts = [];
  if (tagStats.studying) {
    parts.push(`<span class="sv-stat sv-stat-work">изучать ${tagStats.studying}</span>`);
  }
  if (tagStats.known) {
    parts.push(`<span class="sv-stat sv-stat-known">выучено ${tagStats.known}</span>`);
  }
  if (tagStats.stop) {
    parts.push(`<span class="sv-stat sv-stat-stop">стоп ${tagStats.stop}</span>`);
  }
  if (tagStats.noTrans) {
    parts.push(`<span class="sv-stat sv-stat-notrans">без перевода ${tagStats.noTrans}</span>`);
  }
  return parts;
}

function statsTagsHtml(tagStats) {
  const parts = buildTagParts(tagStats);
  if (!parts.length) {
    return `<section class="card card-padded kb-stats source-vocab-stats"><p class="list-empty">Пока нет данных</p></section>`;
  }
  return `
    <section class="card card-padded kb-stats source-vocab-stats">
      <div class="source-vocab-breakdown kb-breakdown">${parts.join("")}</div>
    </section>`;
}

function refreshKbStats(el, ctx) {
  const tagStats = getKbTagStats(ctx, subTab);
  const breakdown = el.querySelector(".kb-breakdown");
  if (breakdown) breakdown.innerHTML = buildTagParts(tagStats).join("");
  updateAddOfferButton(el, ctx);
}

function draw(el, ctx) {
  const stats = getKbStats(ctx);
  const tagStats = getKbTagStats(ctx, subTab);

  el.innerHTML = `
    <div class="page kb-page">
      <h1 class="view-title view-title-section kb-title">База знаний</h1>

      ${statsTagsHtml(tagStats)}

      ${toolbarHtml(ctx)}

      <div class="kb-sticky source-vocab-sticky">
        <div class="tabs kb-kind-tabs source-vocab-kind-tabs" id="kb-type-tabs">
          <button type="button" class="tab-btn${subTab === "words" ? " active" : ""}" data-tab="words">Слова (${stats.words})</button>
          <button type="button" class="tab-btn${subTab === "phrases" ? " active" : ""}" data-tab="phrases">Выражения (${stats.phrases})</button>
        </div>

        <div class="tabs kb-filter-tabs source-vocab-filter-tabs" id="kb-filter-tabs">
          ${KB_FILTERS.map((f) => `
            <button type="button" class="tab-btn tab-btn-sm ${f.cls}${filter === f.id ? " active" : ""}" data-filter="${f.id}">${f.label}</button>
          `).join("")}
        </div>

        <div class="source-vocab-colhead-wrap">
          <table class="list-table list-table-compact source-vocab-colhead-table">
            <thead><tr>
              <th class="col-word">${subTab === "words" ? "Слово" : "Выражение"}</th>
              <th class="col-trans-cell">Переводы</th>
              <th class="col-actions"></th>
            </tr></thead>
          </table>
        </div>
      </div>

      <div class="card list-card kb-list-card source-vocab-list-card">
        <div class="list-table-wrap">
          <table class="list-table list-table-compact">
            <tbody id="kb-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  el.querySelector("#k-search")?.addEventListener("input", (e) => {
    query = e.target.value;
    if (filter === "studying" || filter === "noTrans") {
      if (subTab === "words" && wordsPanel) wordsPanel.setQuery(query);
      if (subTab === "phrases" && phrasesPanel) phrasesPanel.setQuery(query);
      updateAddOfferButton(el, ctx);
    } else {
      refreshKbList(el, ctx);
    }
  });

  el.querySelectorAll("#kb-type-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      subTab = btn.dataset.tab;
      filter = "studying";
      draw(el, ctx);
    });
  });

  el.querySelectorAll("#kb-filter-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      draw(el, ctx);
    });
  });

  bindSearchToolbar(el, ctx);
  renderKbContent(el, ctx);
  bindScrollTop();
}

function renderKbContent(el, ctx) {
  const tbody = el.querySelector("#kb-tbody");
  if (!tbody) return;

  if (filter === "studying" || filter === "noTrans") {
    mountStudying(tbody, ctx, el);
    updateAddOfferButton(el, ctx);
    return;
  }

  if (filter === "known") {
    const learnedWords = filterItems(
      getKnowledgeWords(ctx.state).filter((w) => !w.inStopList),
      query,
      (x) => x.lemma
    );
    const learnedPhrases = filterItems(getKnowledgePhrases(ctx.state), query, (x) => x.text);
    tbody.innerHTML = subTab === "words"
      ? learnedWordsRows(learnedWords)
      : learnedPhrasesRows(learnedPhrases);
    bindLearnedActions(el, ctx);
    enrichLearnedTranslations(ctx, el);
    updateAddOfferButton(el, ctx);
    return;
  }

  if (filter === "stop") {
    if (subTab === "words") {
      const stopWords = filterStopItems(getStopListWords(ctx.state), query);
      tbody.innerHTML = stopWordsRows(stopWords);
      bindStopListActions(el, ctx);
      enrichStopListTranslations(ctx, el);
    } else {
      tbody.innerHTML = stopPhrasesEmptyRow();
    }
    updateAddOfferButton(el, ctx);
  }
}

function refreshKbList(el, ctx) {
  if (filter === "studying" || filter === "noTrans") return;
  renderKbContent(el, ctx);
}

function mountStudying(tbody, ctx, rootEl) {
  const onChange = () => refreshKbStats(rootEl, ctx);
  const panelOpts = {
    query,
    filterNoTrans: filter === "noTrans",
    onChange,
    tbodyOnly: true,
    rootEl,
  };

  if (subTab === "words") {
    wordsPanel = mountWordsPanel(tbody, ctx, { ...panelOpts, prefix: "kw" });
  } else {
    phrasesPanel = mountPhrasesPanel(tbody, ctx, { ...panelOpts, prefix: "kp" });
  }
}

function canAddInSection() {
  return filter === "studying"
    || filter === "noTrans"
    || filter === "known"
    || (filter === "stop" && subTab === "words");
}

function countFilteredItems(ctx, q) {
  if (filter === "studying" || filter === "noTrans") {
    if (subTab === "words") return filterStudyingWords(ctx.state, q, filter === "noTrans").length;
    return filterStudyingPhrases(ctx.state, q, filter === "noTrans").length;
  }
  if (filter === "known") {
    const items = subTab === "words"
      ? getKnowledgeWords(ctx.state).filter((w) => !w.inStopList)
      : getKnowledgePhrases(ctx.state);
    const key = subTab === "words" ? (x) => x.lemma : (x) => x.text;
    return filterItems(items, q, key).length;
  }
  if (filter === "stop" && subTab === "words") {
    return filterStopItems(getStopListWords(ctx.state), q).length;
  }
  return 0;
}

function shouldShowAddOffer(ctx, q) {
  if (!canAddInSection()) return false;
  const s = String(q ?? "").trim();
  if (!s) return false;
  return countFilteredItems(ctx, q) === 0;
}

function filterStudyingWords(state, q, noTransOnly = false) {
  const needle = q.toLowerCase().trim();
  return (state.words || []).filter((w) => {
    if (w.learned) return false;
    if (noTransOnly && (w.translations || []).some(Boolean)) return false;
    if (!needle) return true;
    if (w.lemma.toLowerCase().includes(needle)) return true;
    return (w.translations || []).some((t) => t.toLowerCase().includes(needle));
  });
}

function filterStudyingPhrases(state, q, noTransOnly = false) {
  const needle = q.toLowerCase().trim();
  return (state.phrases || []).filter((p) => {
    if (p.learned) return false;
    if (noTransOnly && (p.translations || []).some(Boolean)) return false;
    if (!needle) return true;
    if (p.text.toLowerCase().includes(needle)) return true;
    return (p.translations || []).some((t) => t.toLowerCase().includes(needle));
  });
}

function toolbarHtml(ctx) {
  const showAdd = shouldShowAddOffer(ctx, query);
  return `
    <div class="list-toolbar kb-search-bar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск…" value="${esc(query)}" />
      <button type="button" id="kb-add-offer" class="btn btn-sm"${showAdd ? "" : " hidden"}>Добавить</button>
    </div>`;
}

function bindSearchToolbar(el, ctx) {
  el.querySelector("#kb-add-offer")?.addEventListener("click", () => {
    openKbAddModal(el, ctx, query.trim());
  });
}

function updateAddOfferButton(el, ctx) {
  const btn = el.querySelector("#kb-add-offer");
  if (!btn) return;
  btn.hidden = !shouldShowAddOffer(ctx, query);
}

function ensureKbAddModal() {
  if (kbAddModalReady) return;
  kbAddModalReady = true;

  document.getElementById("kb-add-backdrop")?.addEventListener("click", closeKbAddModal);
  document.getElementById("kb-modal-cancel")?.addEventListener("click", closeKbAddModal);
  document.getElementById("kb-modal-save")?.addEventListener("click", () => {
    if (kbAddPageEl && kbAddCtx) saveKbAddModal(kbAddPageEl, kbAddCtx);
  });

  const chipWrap = document.getElementById("kb-modal-trans-chips");
  if (chipWrap) {
    bindTransChipsContainers(chipWrap, { onChange() {} });
  }
}

async function openKbAddModal(pageEl, ctx, prefilledText) {
  kbAddPageEl = pageEl;
  kbAddCtx = ctx;
  ensureKbAddModal();

  const modal = document.getElementById("kb-add-modal");
  const isPhrase = subTab === "phrases";
  const text = String(prefilledText ?? "").trim();

  document.getElementById("kb-add-title").textContent = isPhrase ? "Добавить выражение" : "Добавить слово";
  document.getElementById("kb-modal-field-label").textContent = isPhrase ? "Выражение" : "Слово";
  const input = document.getElementById("kb-modal-text");
  input.value = text;

  let trans = [];
  try {
    if (isPhrase) {
      trans = translatePhrase(text, await getPhrases());
    } else if (text) {
      trans = translate(text, await getDictionary());
    }
  } catch (err) {
    console.warn("Не удалось загрузить переводы:", err);
  }

  const chipWrap = document.getElementById("kb-modal-trans-chips");
  chipWrap.innerHTML = transChipsHtml(trans, { id: "kb-modal" });

  modal.hidden = false;
  input.focus();
  input.select();
}

function closeKbAddModal() {
  const modal = document.getElementById("kb-add-modal");
  if (modal) modal.hidden = true;
}

function readModalTranslations() {
  const chipBox = document.querySelector("#kb-modal-trans-chips .trans-chips");
  if (!chipBox) return [];
  return [...chipBox.querySelectorAll(".trans-chip-text")]
    .map((n) => n.textContent.trim())
    .filter(Boolean);
}

function saveKbAddModal(pageEl, ctx) {
  const text = document.getElementById("kb-modal-text")?.value.trim();
  if (!text) {
    alert(subTab === "phrases" ? "Введите выражение." : "Введите слово.");
    return;
  }

  const trans = readModalTranslations();

  if (filter === "studying" || filter === "noTrans") {
    if (subTab === "words") addWordManual(ctx.state, { lemma: text, translations: trans });
    else addPhraseManual(ctx.state, { text, translations: trans });
  } else if (filter === "known") {
    if (subTab === "words") addKnownWordFromImport(ctx.state, { lemma: text, translations: trans, manual: true });
    else addKnownPhraseFromImport(ctx.state, { text, translations: trans });
  } else if (filter === "stop") {
    if (!addStopWord(ctx.state, text, trans)) {
      alert("Слово уже в стоп-листе");
      return;
    }
  }

  ctx.save();
  closeKbAddModal();
  query = "";
  draw(pageEl, ctx);
}

function emptyRow(message = "Список пуст") {
  return `<tr><td colspan="3" class="empty-row">${esc(message)}</td></tr>`;
}

function learnedWordsRows(words) {
  if (!words.length) return emptyRow("Список слов пуст");
  return words.map((w) => learnedWordRow(w)).join("");
}

function learnedPhrasesRows(phrases) {
  if (!phrases.length) return emptyRow("Список выражений пуст");
  return phrases.map((p) => learnedPhraseRow(p)).join("");
}

function stopWordsRows(entries) {
  if (!entries.length) return emptyRow("Стоп-лист пуст. Добавьте слова вручную или при импорте.");
  return entries.map((e) => stopWordRow(e)).join("");
}

function stopPhrasesEmptyRow() {
  return emptyRow("Нет выражений в стоп-листе. Стоп-лист используется для отдельных слов.");
}

function learnedWordRow(entry) {
  const { lemma, word } = entry;
  const trans = word?.translations?.length ? word.translations.join(", ") : "—";
  const inCards = word ? `<span class="tag tag-manual">в карточках</span>` : "";

  return `
    <tr data-lemma="${escAttr(lemma)}">
      <td class="col-word"><strong>${esc(lemma)}</strong>${inCards ? ` ${inCards}` : ""}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <div class="row-actions">
          ${btnReturnStudy(`data-act="return-word" data-lemma="${escAttr(lemma)}"`)}
          ${btnStopList(`data-act="exclude-word" data-lemma="${escAttr(lemma)}"`)}
        </div>
      </td>
    </tr>`;
}

function learnedPhraseRow(entry) {
  const { text, phrase } = entry;
  const trans = phrase?.translations?.length ? phrase.translations.join(", ") : "—";

  return `
    <tr data-text="${escAttr(text)}">
      <td class="col-word"><strong>${esc(text)}</strong>
        ${phrase ? ` <span class="tag tag-manual">в карточках</span>` : ""}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <div class="row-actions">
          ${btnReturnStudy(`data-act="return-phrase" data-text="${escAttr(text)}"`)}
          ${btnRemove(`data-act="exclude-phrase" data-text="${escAttr(text)}"`, { title: "Исключить из импорта" })}
        </div>
      </td>
    </tr>`;
}

function stopWordRow(entry) {
  const { lemma, translations, word } = entry;
  const trans = translations?.length ? translations.join(", ") : "—";
  const inCards = word ? `<span class="tag tag-manual">в карточках</span>` : "";

  return `
    <tr data-lemma="${escAttr(lemma)}">
      <td class="col-word"><strong>${esc(lemma)}</strong>${inCards ? ` ${inCards}` : ""}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        <div class="row-actions">
          ${btnReturnStudy(`data-act="return-stop-word" data-lemma="${escAttr(lemma)}"`)}
          ${btnDeleteWord(`data-act="purge-stop-word" data-lemma="${escAttr(lemma)}"`)}
        </div>
      </td>
    </tr>`;
}

async function enrichStopListTranslations(ctx, el) {
  try {
    const dict = await getDictionary();
    const changed = repairStopListTranslations(ctx.state, (lemma) => translate(lemma, dict));
    if (changed) {
      ctx.save();
      draw(el, ctx);
    }
  } catch (err) {
    console.warn("Не удалось подставить переводы для стоп-листа:", err);
  }
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
  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      const lemma = btn.dataset.lemma;
      if (act === "return-stop-word") {
        if (!confirm(`Вернуть «${lemma}» в изучение?`)) return;
        returnStopWordToStudy(ctx.state, lemma);
      } else if (act === "purge-stop-word") {
        if (!confirm(`Удалить «${lemma}» из базы? Слово исчезнет из стоп-листа и карточек.`)) return;
        purgeWord(ctx.state, lemma);
      }
      ctx.save();
      draw(el, ctx);
    });
  });
}

function filterItems(items, q, getKey) {
  const s = q.toLowerCase().trim();
  if (!s) return items;
  return items.filter((item) => {
    const key = getKey(item).toLowerCase();
    if (key.includes(s)) return true;
    const obj = item.word || item.phrase;
    const trans = item.translations || obj?.translations || [];
    return trans.some((t) => t.toLowerCase().includes(s));
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
