import {
  updatePhrase,
  deletePhrase,
  markPhraseLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260715";
import { openSourcesModal } from "../ui/sources-modal.js?v=20260715";
import { btnLearned, btnDeleteWord, btnSources } from "../ui/action-icons.js";

import { bindScrollTop } from "../ui/scroll-top.js";

export function mountPhrasesPanel(mountEl, ctx, options = {}) {
  const panel = { query: options.query ?? "" };
  const prefix = options.prefix ?? "p";

  function draw() {
    const phrases = getFilteredPhrases(ctx.state, panel.query);

    mountEl.innerHTML = `
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
  const manual = p.manual;
  const manualTag = manual ? `<span class="tag tag-manual">ручное</span>` : "";
  const sourceCount = (p.sources || []).length;
  const sourcesTitle = manual && !sourceCount
    ? "Добавлено вручную"
    : sourceCount
      ? `Источники (${sourceCount})`
      : "Нет источников";
  const canShowSources = manual || sourceCount > 0;

  return `
    <tr data-id="${p.id}">
      <td class="col-word"><strong>${esc(p.text)}</strong>${manualTag ? ` ${manualTag}` : ""}</td>
      <td class="col-trans-cell">${transChipsHtml(p.translations || [], { id: p.id })}</td>
      <td class="col-actions">
        <div class="row-actions">
          ${btnLearned(`data-act="learn" data-id="${p.id}"`)}
          ${btnDeleteWord(`data-act="delete" data-id="${p.id}"`, { title: "Удалить" })}
          ${btnSources(`data-act="sources" data-id="${p.id}"`, escAttr(sourcesTitle), !canShowSources)}
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
        openSourcesModal(ctx.state, phrase.sources, phrase.text, {
          manual: Boolean(phrase.manual) && !(phrase.sources || []).length,
        });
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
