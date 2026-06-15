import {
  getKnowledgeWords,
  getKnowledgePhrases,
  returnWordToStudy,
  returnPhraseToStudy,
  excludeWordFromImport,
  excludePhraseFromImport,
} from "../db/database.js";

let query = "";

export function renderKnowledge(el, ctx) {
  query = "";
  draw(el, ctx);
}

function draw(el, ctx) {
  const words = filterItems(getKnowledgeWords(ctx.state), query, (x) => x.lemma);
  const phrases = filterItems(getKnowledgePhrases(ctx.state), query, (x) => x.text);

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">База знаний</h1>
    <p class="view-subtitle">Выученные слова и выражения. Не попадут в импорт.</p>

    <div class="list-toolbar">
      <input type="search" id="k-search" class="list-search"
        placeholder="Поиск по слову, выражению или переводу…" value="${esc(query)}" />
    </div>

    <div class="list-summary">
      Слов: <b>${words.length}</b> · Выражений: <b>${phrases.length}</b>
    </div>

    <h2 class="import-section-title">Слова</h2>
    <div class="list-table-wrap">
      <table class="list-table">
        <thead><tr>
          <th>Лемма</th><th>Переводы</th><th>Статус</th><th>Действия</th>
        </tr></thead>
        <tbody id="k-words">${words.map((w) => wordRow(w)).join("") || emptyRow(4)}</tbody>
      </table>
    </div>

    <h2 class="import-section-title import-section-gap">Выражения</h2>
    <div class="list-table-wrap">
      <table class="list-table">
        <thead><tr>
          <th>Выражение</th><th>Переводы</th><th>Действия</th>
        </tr></thead>
        <tbody id="k-phrases">${phrases.map((p) => phraseRow(p)).join("") || emptyRow(3)}</tbody>
      </table>
    </div>
    </div>
  `;

  el.querySelector("#k-search").addEventListener("input", (e) => {
    query = e.target.value;
    draw(el, ctx);
  });

  bindActions(el, ctx);
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
      <td>${inStopList ? "Не импортировать" : "Исключено из импорта"}</td>
      <td class="col-actions">
        ${word ? `<button class="row-btn" data-act="return-word" data-lemma="${escAttr(lemma)}">↩ В изучение</button>` : ""}
        <button class="row-btn row-btn-stop" data-act="exclude-word" data-lemma="${escAttr(lemma)}"
          ${inStopList ? "disabled" : ""}>🚫 В стоп-лист</button>
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
        ${phrase ? `<button class="row-btn" data-act="return-phrase" data-text="${escAttr(text)}">↩ В изучение</button>` : ""}
        <button class="row-btn row-btn-stop" data-act="exclude-phrase" data-text="${escAttr(text)}"
          title="Не предлагать при импорте">🚫 Исключить</button>
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

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty-row">Список пуст</td></tr>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
