import {
  addWordManual,
  updateWord,
  deleteWord,
  markWordLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";
import { openSourcesModal } from "../ui/sources-modal.js";

const ICON_SOURCES = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>`;

import { bindScrollTop } from "../ui/scroll-top.js";

export function mountWordsPanel(mountEl, ctx, options = {}) {
  const panel = { query: options.query ?? "" };
  const prefix = options.prefix ?? "w";

  function draw() {
    const words = getFilteredWords(ctx.state, panel.query);

    mountEl.innerHTML = `
      <div id="${prefix}-add-form" class="list-add-form" hidden>
        <input type="text" id="${prefix}-new-lemma" placeholder="Слово (english)" />
        <div id="${prefix}-new-trans-chips"></div>
        <button id="${prefix}-save-new" class="btn">Сохранить</button>
        <button id="${prefix}-cancel-new" class="btn secondary">Отмена</button>
      </div>
      <div class="card list-card">
        <div class="list-table-wrap">
          <table class="list-table list-table-compact">
            <thead><tr>
              <th class="col-word">Слово</th>
              <th class="col-trans-cell">Переводы</th>
              <th class="col-actions"></th>
            </tr></thead>
            <tbody id="${prefix}-tbody">${words.map((w) => rowHtml(w)).join("") || emptyRow()}</tbody>
          </table>
        </div>
      </div>`;

    mountEl.querySelector(`#${prefix}-cancel-new`)?.addEventListener("click", () => {
      mountEl.querySelector(`#${prefix}-add-form`).hidden = true;
    });

    mountEl.querySelector(`#${prefix}-save-new`)?.addEventListener("click", () => {
      const lemma = mountEl.querySelector(`#${prefix}-new-lemma`).value.trim();
      const chipBox = mountEl.querySelector(`#${prefix}-new-trans-chips .trans-chips`);
      const trans = chipBox
        ? [...chipBox.querySelectorAll(".trans-chip-text")].map((n) => n.textContent.trim()).filter(Boolean)
        : [];
      if (!lemma) return alert("Введите слово.");
      addWordManual(ctx.state, { lemma, translations: trans });
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
      box.innerHTML = transChipsHtml([], { id: `${prefix}-new-word` });
      bindTransChipsContainers(box.parentElement, { onChange() {} });
    },
    getCount() {
      return getFilteredWords(ctx.state, panel.query).length;
    },
  };
}

function getFilteredWords(state, q) {
  const query = q.toLowerCase().trim();
  return state.words.filter((w) => {
    if (w.learned) return false;
    if (!query) return true;
    const inLemma = w.lemma.toLowerCase().includes(query);
    const inTrans = (w.translations || []).some((t) => t.toLowerCase().includes(query));
    return inLemma || inTrans;
  }).sort((a, b) => a.lemma.localeCompare(b.lemma));
}

function rowHtml(w) {
  const sourceCount = (w.sources || []).length;
  const sourcesTitle = sourceCount
    ? `Источники (${sourceCount})`
    : "Нет источников";

  return `
    <tr data-id="${w.id}">
      <td class="col-word"><strong>${esc(w.lemma)}</strong></td>
      <td class="col-trans-cell">${transChipsHtml(w.translations || [], { id: w.id })}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button type="button" class="btn outline btn-sm btn-icon-only" data-act="learn" data-id="${w.id}" title="Выучено">✓</button>
          <button type="button" class="btn outline btn-sm btn-icon-only btn-icon-danger" data-act="delete" data-id="${w.id}" title="Удалить слово">✕</button>
          <button type="button" class="btn outline btn-sm btn-icon-only" data-act="sources" data-id="${w.id}" title="${escAttr(sourcesTitle)}" ${sourceCount ? "" : "disabled"}>${ICON_SOURCES}</button>
        </div>
      </td>
    </tr>`;
}

function bindActions(el, ctx, prefix, onDone) {
  bindTransChipsContainers(el, {
    onChange(id, translations) {
      updateWord(ctx.state, id, { translations });
      ctx.save();
    },
  });

  el.querySelector(`#${prefix}-tbody`)?.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.act === "learn") {
        markWordLearned(ctx.state, id);
        ctx.save();
        onDone();
      } else if (btn.dataset.act === "delete") {
        deleteWord(ctx.state, id);
        ctx.save();
        onDone();
      } else if (btn.dataset.act === "sources") {
        const word = ctx.state.words.find((w) => w.id === id);
        if (!word) return;
        openSourcesModal(ctx.state, word.sources, word.lemma);
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
