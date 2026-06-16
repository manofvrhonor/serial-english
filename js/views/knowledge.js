import {
  getKnowledgeWords,
  getKnowledgePhrases,
  returnWordToStudy,
  returnPhraseToStudy,
  excludeWordFromImport,
  excludePhraseFromImport,
} from "../db/database.js";

let query = "";
let tab = "words";

export function renderKnowledge(el, ctx) {
  query = "";
  tab = "words";
  draw(el, ctx);
}

function draw(el, ctx) {
  const words = filterItems(getKnowledgeWords(ctx.state), query, (x) => x.lemma);
  const phrases = filterItems(getKnowledgePhrases(ctx.state), query, (x) => x.text);
  const activeCount = tab === "words" ? words.length : phrases.length;

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">База знаний</h1>
    <p class="view-subtitle">Выученные слова и выражения. Не попадут в импорт.</p>

    <div class="list-toolbar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск по слову, выражению или переводу…" value="${esc(query)}" />
      <div class="tabs" id="k-tabs">
        <button type="button" class="tab-btn${tab === "words" ? " active" : ""}" data-tab="words">Слова</button>
        <button type="button" class="tab-btn${tab === "phrases" ? " active" : ""}" data-tab="phrases">Выражения</button>
      </div>
    </div>

    <div class="list-summary">
      ${tab === "words" ? "Слов" : "Выражений"}: <b>${activeCount}</b>
      · всего слов <b>${words.length}</b> · выражений <b>${phrases.length}</b>
    </div>

    <div class="card list-card">
      ${tab === "words" ? wordsTable(words) : phrasesTable(phrases)}
    </div>
    </div>
  `;

  el.querySelector("#k-search").addEventListener("input", (e) => {
    query = e.target.value;
    draw(el, ctx);
  });

  el.querySelectorAll("#k-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      draw(el, ctx);
    });
  });

  bindActions(el, ctx);
}

function wordsTable(words) {
  if (!words.length) {
    return `<div class="list-empty">Список слов пуст</div>`;
  }
  return `
    <div class="list-table-wrap">
      <table class="list-table">
        <thead><tr>
          <th>Лемма</th><th>Переводы</th><th></th>
        </tr></thead>
        <tbody id="k-words">${words.map((w) => wordRow(w)).join("")}</tbody>
      </table>
    </div>`;
}

function phrasesTable(phrases) {
  if (!phrases.length) {
    return `<div class="list-empty">Список выражений пуст</div>`;
  }
  return `
    <div class="list-table-wrap">
      <table class="list-table">
        <thead><tr>
          <th>Выражение</th><th>Переводы</th><th></th>
        </tr></thead>
        <tbody id="k-phrases">${phrases.map((p) => phraseRow(p)).join("")}</tbody>
      </table>
    </div>`;
}

function filterItems(items, q, getKey) {
  const s = q.toLowerCase().trim();
  if (!s) return items;
  return items.filter((item) => {
    const key = getKey(item).toLowerCase();
    if (key.includes(s)) return true;
    const obj = item.word || item.phrase;
    const trans = (obj?.translations || []).some((t) => t.toLowerCase().includes(s));
    return trans;
  });
}

function wordRow(entry) {
  const { lemma, word, inStopList } = entry;
  const trans = word?.translations?.length
    ? word.translations.join(", ")
    : "—";
  const status = inStopList
    ? `<span class="tag tag-stop">стоп-лист</span>`
    : `<span class="tag tag-known">выучено</span>`;
  const inCards = word ? `<span class="tag tag-manual">в карточках</span>` : "";

  return `
    <tr data-lemma="${escAttr(lemma)}">
      <td><strong>${esc(lemma)}</strong><br>${status} ${inCards}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        ${word ? `<button type="button" class="btn outline btn-sm" data-act="return-word" data-lemma="${escAttr(lemma)}" title="Вернуть в изучение">↩</button>` : ""}
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="exclude-word" data-lemma="${escAttr(lemma)}"
          title="В стоп-лист" ${inStopList ? "disabled" : ""}>🚫</button>
      </td>
    </tr>`;
}

function phraseRow(entry) {
  const { text, phrase } = entry;
  const trans = phrase?.translations?.length
    ? phrase.translations.join(", ")
    : "—";

  return `
    <tr data-text="${escAttr(text)}">
      <td><strong>${esc(text)}</strong><br><span class="tag tag-known">выучено</span>
        ${phrase ? `<span class="tag tag-manual">в карточках</span>` : ""}</td>
      <td class="col-trans-cell">${esc(trans)}</td>
      <td class="col-actions">
        ${phrase ? `<button type="button" class="btn outline btn-sm" data-act="return-phrase" data-text="${escAttr(text)}" title="Вернуть в изучение">↩</button>` : ""}
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="exclude-phrase" data-text="${escAttr(text)}"
          title="Исключить из импорта">🚫</button>
      </td>
    </tr>`;
}

function bindActions(el, ctx) {
  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const act = btn.dataset.act;

      if (act === "return-word") {
        if (!confirm(`Вернуть «${btn.dataset.lemma}» в изучение?`)) return;
        returnWordToStudy(ctx.state, btn.dataset.lemma);
      } else if (act === "exclude-word") {
        if (!confirm(`Добавить «${btn.dataset.lemma}» в стоп-лист? Слово не будет предлагаться при импорте.`)) return;
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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
