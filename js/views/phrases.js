import {
  resolveSourceLabel,
  addPhraseManual,
  updatePhrase,
  deletePhrase,
  markPhraseLearned,
  unmarkPhraseLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";

let filter = "all";
let query = "";

export function renderPhrases(el, ctx) {
  filter = "all";
  query = "";
  draw(el, ctx);
}

function draw(el, ctx) {
  const phrases = getFilteredPhrases(ctx.state);

  el.innerHTML = `
    <div class="page">
    <div class="page-header-row">
      <div>
        <h1 class="view-title">Выражения</h1>
        <p class="view-subtitle">${phrases.length} из ${ctx.state.phrases.length} · устойчивые фразы</p>
      </div>
      <button id="p-add" class="btn btn-sm">+ Добавить</button>
    </div>

    <div class="list-toolbar">
      <input type="search" id="p-search" class="list-search" placeholder="Поиск по выражению или переводу…" value="${esc(query)}" />
      <select id="p-filter" class="list-filter">
        <option value="all" ${filter === "all" ? "selected" : ""}>Все</option>
        <option value="active" ${filter === "active" ? "selected" : ""}>В изучении</option>
        <option value="learned" ${filter === "learned" ? "selected" : ""}>Выучено</option>
      </select>
    </div>

    <div id="p-add-form" class="list-add-form" hidden>
      <input type="text" id="p-new-text" placeholder="Выражение (english)" />
      <div id="p-new-trans-chips"></div>
      <button id="p-save-new" class="btn">Сохранить</button>
      <button id="p-cancel-new" class="btn secondary">Отмена</button>
    </div>

    <div class="card list-card">
      <div class="list-table-wrap">
        <table class="list-table">
          <thead><tr>
            <th>Выражение</th><th>Переводы</th><th>Источники</th><th>SRS</th><th></th>
          </tr></thead>
          <tbody id="p-tbody">${phrases.map((p) => rowHtml(p, ctx)).join("") || emptyRow()}</tbody>
        </table>
      </div>
    </div>
    </div>
  `;

  el.querySelector("#p-search").addEventListener("input", (e) => {
    query = e.target.value;
    draw(el, ctx);
  });
  el.querySelector("#p-filter").addEventListener("change", (e) => {
    filter = e.target.value;
    draw(el, ctx);
  });
  el.querySelector("#p-add").addEventListener("click", () => {
    el.querySelector("#p-add-form").hidden = false;
    const box = el.querySelector("#p-new-trans-chips");
    box.innerHTML = transChipsHtml([], { id: "new-phrase" });
    bindTransChipsContainers(box.parentElement, { onChange() {} });
  });
  el.querySelector("#p-cancel-new").addEventListener("click", () => {
    el.querySelector("#p-add-form").hidden = true;
  });
  el.querySelector("#p-save-new").addEventListener("click", () => {
    const text = el.querySelector("#p-new-text").value.trim();
    const chipBox = el.querySelector("#p-new-trans-chips .trans-chips");
    const trans = chipBox
      ? [...chipBox.querySelectorAll(".trans-chip-text")].map((n) => n.textContent.trim()).filter(Boolean)
      : [];
    if (!text) return alert("Введите выражение.");
    addPhraseManual(ctx.state, { text, translations: trans });
    ctx.save();
    draw(el, ctx);
  });

  bindActions(el, ctx);
}

function getFilteredPhrases(state) {
  const q = query.toLowerCase().trim();
  return state.phrases.filter((p) => {
    if (filter === "active" && p.learned) return false;
    if (filter === "learned" && !p.learned) return false;
    if (!q) return true;
    const inText = p.text.toLowerCase().includes(q);
    const inTrans = (p.translations || []).some((t) => t.toLowerCase().includes(q));
    return inText || inTrans;
  }).sort((a, b) => a.text.localeCompare(b.text));
}

function srsLabel(p) {
  const en = p.srs?.enru?.level ?? 0;
  const ru = p.srs?.ruen?.level ?? 0;
  return `EN→RU: ${en} · RU→EN: ${ru}`;
}

function sourcesLabel(state, p) {
  const ids = p.sources || [];
  if (!ids.length) return "—";
  if (ids.length === 1) return esc(resolveSourceLabel(state, ids[0]));
  return `${ids.length} источн.`;
}

function rowHtml(p, ctx) {
  const status = p.learned ? `<span class="tag tag-known">выучено</span>` : `<span class="tag tag-new">изучаю</span>`;
  const manual = p.manual ? `<span class="tag tag-manual">ручное</span>` : "";
  return `
    <tr data-id="${p.id}">
      <td><strong>${esc(p.text)}</strong><br>${status} ${manual}</td>
      <td class="col-trans-cell">
        ${transChipsHtml(p.translations || [], { id: p.id })}
      </td>
      <td class="col-sources">${sourcesLabel(ctx.state, p)}</td>
      <td class="col-srs">${srsLabel(p)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="learn" data-id="${p.id}" title="${p.learned ? "Вернуть в изучение" : "Выучено"}">${p.learned ? "↩" : "✓"}</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="delete" data-id="${p.id}" title="Удалить">✕</button>
      </td>
    </tr>`;
}

function bindActions(el, ctx) {
  bindTransChipsContainers(el, {
    onChange(id, translations) {
      updatePhrase(ctx.state, id, { translations });
      ctx.save();
    },
  });

  el.querySelector("#p-tbody")?.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === "learn") {
        const p = ctx.state.phrases.find((x) => x.id === id);
        if (p?.learned) unmarkPhraseLearned(ctx.state, id);
        else markPhraseLearned(ctx.state, id);
      } else if (btn.dataset.act === "delete") {
        deletePhrase(ctx.state, id);
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
