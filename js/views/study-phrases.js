import {
  resolveSourceLabel,
  addPhraseManual,
  updatePhrase,
  deletePhrase,
  markPhraseLearned,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js";

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
          <table class="list-table">
            <thead><tr>
              <th>Выражение</th><th>Переводы</th><th>Источники</th><th>SRS</th><th></th>
            </tr></thead>
            <tbody id="${prefix}-tbody">${phrases.map((p) => rowHtml(p, ctx)).join("") || emptyRow()}</tbody>
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
  const manual = p.manual ? `<span class="tag tag-manual">ручное</span>` : "";
  return `
    <tr data-id="${p.id}">
      <td><strong>${esc(p.text)}</strong><br><span class="tag tag-new">изучаю</span> ${manual}</td>
      <td class="col-trans-cell">${transChipsHtml(p.translations || [], { id: p.id })}</td>
      <td class="col-sources">${sourcesLabel(ctx.state, p)}</td>
      <td class="col-srs">${srsLabel(p)}</td>
      <td class="col-actions">
        <button type="button" class="btn outline btn-sm" data-act="learn" data-id="${p.id}" title="Выучено">✓</button>
        <button type="button" class="btn outline btn-sm btn-icon-danger" data-act="delete" data-id="${p.id}" title="Удалить">✕</button>
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
      } else if (btn.dataset.act === "delete") {
        deletePhrase(ctx.state, id);
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
