import {
  resolveSourceLabel,
  addWordManual,
  updateWord,
  deleteWord,
  markWordLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";

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
          <table class="list-table">
            <thead><tr>
              <th>Слово</th><th>Переводы</th><th>Источники</th><th>SRS</th><th></th>
            </tr></thead>
            <tbody id="${prefix}-tbody">${words.map((w) => rowHtml(w, ctx)).join("") || emptyRow()}</tbody>
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
  return `
    <tr data-id="${w.id}">
      <td><strong>${esc(w.lemma)}</strong><br><span class="tag tag-new">изучаю</span></td>
      <td class="col-trans-cell">${transChipsHtml(w.translations || [], { id: w.id })}</td>
      <td class="col-sources">${sourcesLabel(ctx.state, w)}</td>
      <td class="col-srs">${srsLabel(w)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="learn" data-id="${w.id}" title="Выучено">✓</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="delete" data-id="${w.id}" title="Удалить слово">✕</button>
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
      } else if (btn.dataset.act === "delete") {
        deleteWord(ctx.state, id);
      }
      ctx.save();
      onDone();
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
