import {
  addPhraseManual,
  updatePhrase,
  deletePhrase,
  markPhraseLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";
import { openSourcesModal } from "../ui/sources-modal.js";

const ICON_SOURCES = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>`;

import { bindScrollTop } from "../ui/scroll-top.js";

export function mountPhrasesPanel(mountEl, ctx, options = {}) {
  const panel = { query: options.query ?? "" };
  const prefix = options.prefix ?? "p";

  function draw() {
    const phrases = getFilteredPhrases(ctx.state, panel.query);

    mountEl.innerHTML = `
      <div id="${prefix}-add-form" class="list-add-form" hidden>
        <input type="text" id="${prefix}-new-text" placeholder="Выражение (english)" />
        <div id="${prefix}-new-trans-chips"></div>
        <button id="${prefix}-save-new" class="btn">Сохранить</button>
        <button id="${prefix}-cancel-new" class="btn secondary">Отмена</button>
      </div>
      <div class="card list-card">
        <div class="list-table-wrap">
          <table class="list-table list-table-compact">
            <thead><tr>
              <th class="col-word">Выражение</th>
              <th class="col-trans-cell">Переводы</th>
              <th class="col-actions"></th>
            </tr></thead>
            <tbody id="${prefix}-tbody">${phrases.map((p) => rowHtml(p)).join("") || emptyRow()}</tbody>
          </table>
        </div>
      </div>`;

    mountEl.querySelector(`#${prefix}-cancel-new`)?.addEventListener("click", () => {
      mountEl.querySelector(`#${prefix}-add-form`).hidden = true;
    });

    mountEl.querySelector(`#${prefix}-save-new`)?.addEventListener("click", () => {
      const text = mountEl.querySelector(`#${prefix}-new-text`).value.trim();
      const chipBox = mountEl.querySelector(`#${prefix}-new-trans-chips .trans-chips`);
      const trans = chipBox
        ? [...chipBox.querySelectorAll(".trans-chip-text")].map((n) => n.textContent.trim()).filter(Boolean)
        : [];
      if (!text) return alert("Введите выражение.");
      addPhraseManual(ctx.state, { text, translations: trans });
      ctx.save();
      options.onChange?.();
      draw();
    });

    bindActions(mountEl, ctx, prefix, () => {
      options.onChange?.();
      draw();
    });

    bindScrollTop();
  }

  draw();

  return {
    redraw: draw,
    setQuery(q) {
      panel.query = q;
      draw();
    },
    openAddForm() {
      const form = mountEl.querySelector(`#${prefix}-add-form`);
      if (!form) return;
      form.hidden = false;
      const box = mountEl.querySelector(`#${prefix}-new-trans-chips`);
      box.innerHTML = transChipsHtml([], { id: `${prefix}-new-phrase` });
      bindTransChipsContainers(box.parentElement, { onChange() {} });
    },
    getCount() {
      return getFilteredPhrases(ctx.state, panel.query).length;
    },
  };
}

function getFilteredPhrases(state, q) {
  const query = q.toLowerCase().trim();
  return state.phrases.filter((p) => {
    if (p.learned) return false;
    if (!query) return true;
    const inText = p.text.toLowerCase().includes(query);
    const inTrans = (p.translations || []).some((t) => t.toLowerCase().includes(query));
    return inText || inTrans;
  }).sort((a, b) => a.text.localeCompare(b.text));
}

function rowHtml(p) {
  const manual = p.manual ? `<span class="tag tag-manual">ручное</span>` : "";
  const sourceCount = (p.sources || []).length;
  const sourcesTitle = sourceCount
    ? `Источники (${sourceCount})`
    : "Нет источников";

  return `
    <tr data-id="${p.id}">
      <td class="col-word"><strong>${esc(p.text)}</strong><br><span class="tag tag-new">изучаю</span> ${manual}</td>
      <td class="col-trans-cell">${transChipsHtml(p.translations || [], { id: p.id })}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button type="button" class="btn outline btn-sm btn-icon-only" data-act="learn" data-id="${p.id}" title="Выучено">✓</button>
          <button type="button" class="btn outline btn-sm btn-icon-only btn-icon-danger" data-act="delete" data-id="${p.id}" title="Удалить">✕</button>
          <button type="button" class="btn outline btn-sm btn-icon-only" data-act="sources" data-id="${p.id}" title="${escAttr(sourcesTitle)}" ${sourceCount ? "" : "disabled"}>${ICON_SOURCES}</button>
        </div>
      </td>
    </tr>`;
}

function bindActions(el, ctx, prefix, onDone) {
  bindTransChipsContainers(el, {
    onChange(id, translations) {
      updatePhrase(ctx.state, id, { translations });
      ctx.save();
    },
  });

  el.querySelector(`#${prefix}-tbody`)?.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === "learn") {
        markPhraseLearned(ctx.state, id);
        ctx.save();
        onDone();
      } else if (btn.dataset.act === "delete") {
        deletePhrase(ctx.state, id);
        ctx.save();
        onDone();
      } else if (btn.dataset.act === "sources") {
        const phrase = ctx.state.phrases.find((p) => p.id === id);
        if (!phrase) return;
        openSourcesModal(ctx.state, phrase.sources, phrase.text);
      }
    });
  });
}

function emptyRow() {
  return `<tr><td colspan="3" class="empty-row">Список пуст</td></tr>`;
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
