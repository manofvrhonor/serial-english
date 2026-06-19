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
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260721";
import { btnReturnStudy, btnStopList, btnDeleteWord, btnRemove } from "../ui/action-icons.js";
import { countTrainingItems } from "../core/srs.js";
import { mountWordsPanel } from "./study-words.js?v=20260721";
import { mountPhrasesPanel } from "./study-phrases.js?v=20260721";
import { bindScrollTop } from "../ui/scroll-top.js";

let section = "studying";
let subTab = "words";
let query = "";
let filterNoTrans = false;
let wordsPanel = null;
let phrasesPanel = null;
let kbAddModalReady = false;
let kbAddPageEl = null;
let kbAddCtx = null;

export function renderKnowledge(el, ctx) {
  section = "studying";
  subTab = "words";
  query = "";
  filterNoTrans = false;
  wordsPanel = null;
  phrasesPanel = null;
  draw(el, ctx);
}

function draw(el, ctx) {
  const baseStats = getAppStats(ctx.state);
  const stats = {
    ...baseStats,
    dueWords: countTrainingItems(ctx.state, { content: "words", direction: "both", dueOnly: true }),
    duePhrases: countTrainingItems(ctx.state, { content: "phrases", direction: "both", dueOnly: true }),
  };
  el.innerHTML = `
    <div class="page">
    <h1 class="view-title view-title-section">База знаний</h1>

    ${typeTabsHtml()}
    ${statsCardHtml(subTab, stats)}

    <div class="tabs kb-section-tabs" id="kb-section-tabs">
      <button type="button" class="tab-btn${section === "studying" ? " active" : ""}" data-section="studying">На изучении</button>
      <button type="button" class="tab-btn${section === "learned" ? " active" : ""}" data-section="learned">Выучено</button>
      <button type="button" class="tab-btn${section === "stoplist" ? " active" : ""}" data-section="stoplist">Стоп-лист</button>
    </div>

    ${toolbarHtml(ctx, stats)}

    <div id="kb-content"></div>
    </div>
  `;

  el.querySelector("#k-search")?.addEventListener("input", (e) => {
    query = e.target.value;
    if (section === "studying") {
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
      filterNoTrans = false;
      draw(el, ctx);
    });
  });

  el.querySelectorAll("#kb-section-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      section = btn.dataset.section;
      filterNoTrans = false;
      draw(el, ctx);
    });
  });

  bindSearchToolbar(el, ctx);
  bindNoTransFilter(el, ctx);

  renderKbContent(el, ctx);

  bindScrollTop();
}

function renderKbContent(el, ctx) {
  const content = el.querySelector("#kb-content");
  if (!content) return;

  if (section === "studying") {
    mountStudying(content, ctx, el);
    updateAddOfferButton(el, ctx);
    return;
  }

  if (section === "learned") {
    const learnedWords = filterItems(
      getKnowledgeWords(ctx.state).filter((w) => !w.inStopList),
      query,
      (x) => x.lemma
    );
    const learnedPhrases = filterItems(getKnowledgePhrases(ctx.state), query, (x) => x.text);
    content.innerHTML = subTab === "words"
      ? learnedWordsTable(learnedWords)
      : learnedPhrasesTable(learnedPhrases);
    bindLearnedActions(el, ctx);
    enrichLearnedTranslations(ctx, el);
    updateAddOfferButton(el, ctx);
    return;
  }

  const stopWords = filterStopItems(getStopListWords(ctx.state), query);
  content.innerHTML = subTab === "words"
    ? stopListTable(stopWords)
    : stopListPhrasesTable();
  if (subTab === "words") {
    bindStopListActions(el, ctx);
    enrichStopListTranslations(ctx, el);
  }
  updateAddOfferButton(el, ctx);
}

function refreshKbList(el, ctx) {
  if (section === "studying") return;
  renderKbContent(el, ctx);
}

function mountStudying(content, ctx, rootEl) {
  const onChange = () => {};

  if (subTab === "words") {
    wordsPanel = mountWordsPanel(content, ctx, {
      prefix: "kw", query, filterNoTrans, onChange,
    });
  } else {
    phrasesPanel = mountPhrasesPanel(content, ctx, {
      prefix: "kp", query, filterNoTrans, onChange,
    });
  }
}

function typeTabsHtml() {
  return `
    <div class="tabs kb-type-tabs" id="kb-type-tabs">
      <button type="button" class="tab-btn${subTab === "words" ? " active" : ""}" data-tab="words">Слова</button>
      <button type="button" class="tab-btn${subTab === "phrases" ? " active" : ""}" data-tab="phrases">Выражения</button>
    </div>`;
}

function statsCardHtml(tab, stats) {
  if (tab === "words") {
    return `
      <section class="card card-padded settings-card kb-stats">
        <div class="settings-stats kb-settings-stats">
          <div class="stat-item"><span class="stat-num">${stats.words}</span> слов</div>
          <div class="stat-item"><span class="stat-num">${stats.learnedWords}</span> выучено</div>
          <div class="stat-item"><span class="stat-num">${stats.studyingWords}</span> в работе</div>
          <div class="stat-item"><span class="stat-num">${stats.dueWords}</span> к повторению сегодня</div>
        </div>
      </section>`;
  }
  return `
    <section class="card card-padded settings-card kb-stats">
      <div class="settings-stats kb-settings-stats">
        <div class="stat-item"><span class="stat-num">${stats.phrases}</span> выражений</div>
        <div class="stat-item"><span class="stat-num">${stats.learnedPhrases}</span> выучено</div>
        <div class="stat-item"><span class="stat-num">${stats.studyingPhrases}</span> в работе</div>
        <div class="stat-item"><span class="stat-num">${stats.duePhrases}</span> к повторению сегодня</div>
      </div>
    </section>`;
}

function canAddInSection() {
  return section === "studying"
    || section === "learned"
    || (section === "stoplist" && subTab === "words");
}

function countFilteredItems(ctx, q) {
  if (section === "studying") {
    if (subTab === "words") return filterStudyingWords(ctx.state, q, filterNoTrans).length;
    return filterStudyingPhrases(ctx.state, q, filterNoTrans).length;
  }
  if (section === "learned") {
    const items = subTab === "words"
      ? getKnowledgeWords(ctx.state).filter((w) => !w.inStopList)
      : getKnowledgePhrases(ctx.state);
    const key = subTab === "words" ? (x) => x.lemma : (x) => x.text;
    return filterItems(items, q, key).length;
  }
  if (section === "stoplist" && subTab === "words") {
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

function noTransCount(stats) {
  return subTab === "words" ? stats.noTransWords : stats.noTransPhrases;
}

function toolbarHtml(ctx, stats) {
  const showAdd = shouldShowAddOffer(ctx, query);
  const noTrans = section === "studying" ? noTransCount(stats) : 0;
  const filterBtn = noTrans
    ? `<button type="button" id="kb-filter-notrans" class="btn btn-sm${filterNoTrans ? " active" : ""}" aria-label="Показать только без перевода">Без перевода (${noTrans})</button>`
    : "";
  return `
    <div class="list-toolbar kb-search-bar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск…" value="${esc(query)}" />
      ${filterBtn}
      <button type="button" id="kb-add-offer" class="btn btn-sm"${showAdd ? "" : " hidden"}>Добавить</button>
    </div>`;
}

function bindNoTransFilter(el, ctx) {
  el.querySelector("#kb-filter-notrans")?.addEventListener("click", () => {
    filterNoTrans = !filterNoTrans;
    const btn = el.querySelector("#kb-filter-notrans");
    if (btn) btn.classList.toggle("active", filterNoTrans);
    if (subTab === "words" && wordsPanel) wordsPanel.setFilterNoTrans(filterNoTrans);
    if (subTab === "phrases" && phrasesPanel) phrasesPanel.setFilterNoTrans(filterNoTrans);
    updateAddOfferButton(el, ctx);
  });
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

  if (section === "studying") {
    if (subTab === "words") addWordManual(ctx.state, { lemma: text, translations: trans });
    else addPhraseManual(ctx.state, { text, translations: trans });
  } else if (section === "learned") {
    if (subTab === "words") addKnownWordFromImport(ctx.state, { lemma: text, translations: trans, manual: true });
    else addKnownPhraseFromImport(ctx.state, { text, translations: trans });
  } else if (section === "stoplist") {
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

function learnedWordsTable(words) {
  if (!words.length) {
    return `<div class="card list-card"><div class="list-empty">Список слов пуст</div></div>`;
  }
  return `
    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table list-table-compact">
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
        <table class="list-table list-table-compact">
          <thead><tr><th>Выражение</th><th>Переводы</th><th></th></tr></thead>
          <tbody>${phrases.map((p) => learnedPhraseRow(p)).join("")}</tbody>
        </table>
      </div>
    </div>`;
}

function stopListPhrasesTable() {
  return `
    <div class="card list-card">
      <div class="list-empty">Нет выражений в стоп-листе. Стоп-лист используется для отдельных слов.</div>
    </div>`;
}

function stopListTable(entries) {
  if (!entries.length) {
    return `<div class="card list-card"><div class="list-empty">Стоп-лист пуст. Добавьте слова вручную или при импорте.</div></div>`;
  }
  return `
    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table list-table-compact">
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
      <td><strong>${esc(lemma)}</strong>${inCards ? ` ${inCards}` : ""}</td>
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
      <td><strong>${esc(text)}</strong>
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
      <td><strong>${esc(lemma)}</strong>${inCards ? ` ${inCards}` : ""}</td>
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
