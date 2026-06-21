import {
  updateWord,
  deleteWord,
  markWordLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260621";
import { openSourcesModal } from "../ui/sources-modal.js?v=20260621";
import { btnLearned, btnStopList, btnSources } from "../ui/action-icons.js";

import { bindScrollTop } from "../ui/scroll-top.js";

export function mountWordsPanel(mountEl, ctx, options = {}) {
  const panel = { query: options.query ?? "", filterNoTrans: options.filterNoTrans ?? false };
  const prefix = options.prefix ?? "w";

  function draw() {
    const words = getFilteredWords(ctx.state, panel.query, panel.filterNoTrans);

    mountEl.innerHTML = `
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
    setFilterNoTrans(v) {
      panel.filterNoTrans = v;
      draw();
    },
  };
}

function getFilteredWords(state, q, filterNoTrans = false) {
  const query = q.toLowerCase().trim();
  return state.words.filter((w) => {
    if (w.learned) return false;
    if (filterNoTrans && (w.translations || []).some(Boolean)) return false;
    if (!query) return true;
    const inLemma = w.lemma.toLowerCase().includes(query);
    const inTrans = (w.translations || []).some((t) => t.toLowerCase().includes(query));
    return inLemma || inTrans;
  }).sort((a, b) => a.lemma.localeCompare(b.lemma));
}

function isManualWord(w) {
  return Boolean(w.manual) || !(w.sources || []).length;
}

function rowHtml(w) {
  const manual = isManualWord(w);
  const sourceCount = (w.sources || []).length;
  const sourcesTitle = manual && !sourceCount
    ? "Добавлено вручную"
    : sourceCount
      ? `Источники (${sourceCount})`
      : "Нет источников";
  const canShowSources = manual || sourceCount > 0;

  return `
    <tr data-id="${w.id}">
      <td class="col-word"><strong>${esc(w.lemma)}</strong></td>
      <td class="col-trans-cell">${transChipsHtml(w.translations || [], { id: w.id })}</td>
      <td class="col-actions">
        <div class="row-actions">
          ${btnLearned(`data-act="learn" data-id="${w.id}"`)}
          ${btnStopList(`data-act="stop" data-id="${w.id}"`)}
          ${btnSources(`data-act="sources" data-id="${w.id}"`, escAttr(sourcesTitle), !canShowSources)}
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
      } else if (btn.dataset.act === "stop") {
        deleteWord(ctx.state, id);
        ctx.save();
        onDone();
      } else if (btn.dataset.act === "sources") {
        const word = ctx.state.words.find((w) => w.id === id);
        if (!word) return;
        openSourcesModal(ctx.state, word.sources, word.lemma, { manual: isManualWord(word) });
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
