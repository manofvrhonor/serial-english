import {
  resolveSourceLabel,
  addWordManual,
  updateWord,
  deleteWord,
  markWordLearned,
  unmarkWordLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";

let filter = "all";
let query = "";

export function renderWords(el, ctx) {
  filter = "all";
  query = "";
  draw(el, ctx);
}

function draw(el, ctx) {
  const words = getFilteredWords(ctx.state);

  el.innerHTML = `
    <div class="page">
    <div class="page-header-row">
      <div>
        <h1 class="view-title">Слова</h1>
        <p class="view-subtitle">${words.length} из ${ctx.state.words.length} · переводы и SRS</p>
      </div>
      <button id="w-add" class="btn btn-sm">+ Добавить</button>
    </div>

    <div class="list-toolbar">
      <input type="search" id="w-search" class="list-search" placeholder="Поиск по лемме или переводу…" value="${esc(query)}" />
      <select id="w-filter" class="list-filter">
        <option value="all" ${filter === "all" ? "selected" : ""}>Все</option>
        <option value="active" ${filter === "active" ? "selected" : ""}>В изучении</option>
        <option value="learned" ${filter === "learned" ? "selected" : ""}>Выучено</option>
      </select>
    </div>

    <div id="w-add-form" class="list-add-form" hidden>
      <input type="text" id="w-new-lemma" placeholder="Лемма (english)" />
      <div id="w-new-trans-chips"></div>
      <button id="w-save-new" class="btn">Сохранить</button>
      <button id="w-cancel-new" class="btn secondary">Отмена</button>
    </div>

    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table">
          <thead><tr>
            <th>Лемма</th><th>Переводы</th><th>Источники</th><th>SRS</th><th></th>
          </tr></thead>
          <tbody id="w-tbody">${words.map((w) => rowHtml(w, ctx)).join("") || emptyRow()}</tbody>
        </table>
      </div>
    </div>
    </div>
  `;

  el.querySelector("#w-search").addEventListener("input", (e) => {
    query = e.target.value;
    draw(el, ctx);
  });
  el.querySelector("#w-filter").addEventListener("change", (e) => {
    filter = e.target.value;
    draw(el, ctx);
  });
  el.querySelector("#w-add").addEventListener("click", () => {
    el.querySelector("#w-add-form").hidden = false;
    const box = el.querySelector("#w-new-trans-chips");
    box.innerHTML = transChipsHtml([], { id: "new-word" });
    bindTransChipsContainers(box.parentElement, { onChange() {} });
  });
  el.querySelector("#w-cancel-new").addEventListener("click", () => {
    el.querySelector("#w-add-form").hidden = true;
  });
  el.querySelector("#w-save-new").addEventListener("click", () => {
    const lemma = el.querySelector("#w-new-lemma").value.trim();
    const chipBox = el.querySelector("#w-new-trans-chips .trans-chips");
    const trans = chipBox
      ? [...chipBox.querySelectorAll(".trans-chip-text")].map((n) => n.textContent.trim()).filter(Boolean)
      : [];
    if (!lemma) return alert("Введите лемму.");
    addWordManual(ctx.state, { lemma, translations: trans });
    ctx.save();
    draw(el, ctx);
  });

  bindActions(el, ctx);
}

function getFilteredWords(state) {
  const q = query.toLowerCase().trim();
  return state.words.filter((w) => {
    if (filter === "active" && w.learned) return false;
    if (filter === "learned" && !w.learned) return false;
    if (!q) return true;
    const inLemma = w.lemma.toLowerCase().includes(q);
    const inTrans = (w.translations || []).some((t) => t.toLowerCase().includes(q));
    return inLemma || inTrans;
  }).sort((a, b) => a.lemma.localeCompare(b.lemma));
}

function srsLabel(w) {
  const en = w.srs?.enru?.level ?? 0;
  const ru = w.srs?.ruen?.level ?? 0;
  return `EN→RU: ${en} · RU→EN: ${ru}`;
}

function sourcesLabel(state, w) {
  const ids = w.sources || [];
  if (!ids.length) return "—";
  if (ids.length === 1) return esc(resolveSourceLabel(state, ids[0]));
  return `${ids.length} источн.`;
}

function rowHtml(w, ctx) {
  const status = w.learned ? `<span class="tag tag-known">выучено</span>` : `<span class="tag tag-new">изучаю</span>`;
  return `
    <tr data-id="${w.id}">
      <td><strong>${esc(w.lemma)}</strong><br>${status}</td>
      <td class="col-trans-cell">
        ${transChipsHtml(w.translations || [], { id: w.id })}
      </td>
      <td class="col-sources">${sourcesLabel(ctx.state, w)}</td>
      <td class="col-srs">${srsLabel(w)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="learn" data-id="${w.id}" title="${w.learned ? "Вернуть в изучение" : "Выучено"}">${w.learned ? "↩" : "✓"}</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="delete" data-id="${w.id}" title="Удалить слово">✕</button>
      </td>
    </tr>`;
}

function bindActions(el, ctx) {
  bindTransChipsContainers(el, {
    onChange(id, translations) {
      updateWord(ctx.state, id, { translations });
      ctx.save();
    },
  });

  el.querySelector("#w-tbody")?.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === "learn") {
        const w = ctx.state.words.find((x) => x.id === id);
        if (w?.learned) unmarkWordLearned(ctx.state, id);
        else markWordLearned(ctx.state, id);
      } else if (btn.dataset.act === "delete") {
        deleteWord(ctx.state, id);
      }
      ctx.save();
      draw(el, ctx);
    });
  });
}

function emptyRow() {
  return `<tr><td colspan="5" class="empty-row">Список пуст</td></tr>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
