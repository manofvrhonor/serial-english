import {
  calcReadiness,
  getSnapshotEntries,
  readinessBadge,
  ensureSnapshotItems,
  sourceNeedsMaterialize,
} from "../core/readiness.js";
import {
  findWordById,
  findPhraseById,
  findWordByLemma,
  findPhraseByText,
  updateWord,
  updatePhrase,
  addWords,
  addPhrases,
  markWordLearned,
  markPhraseLearned,
  deleteWord,
  returnWordToStudy,
  returnPhraseToStudy,
  returnStopWordToStudy,
} from "../db/database.js";
import { getDictionary } from "../import/dictionary.js";
import { getPhrases } from "../import/phrases.js";
import { btnLearned, btnStopList, btnReturnStudy } from "../ui/action-icons.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260621";
import { titleCase } from "../core/display-text.js";
import { bindScrollTop } from "../ui/scroll-top.js";

const STATUS_FILTERS = [
  { id: "known", label: "Выучено" },
  { id: "studying", label: "Изучать" },
  { id: "stop", label: "Стоп" },
  { id: "noTrans", label: "Без перевода" },
];

const FILTER_TAB_CLS = {
  known: "filter-tab-known",
  studying: "filter-tab-studying",
  stop: "filter-tab-stop",
  noTrans: "filter-tab-notrans",
};

export function renderSourceVocab(el, ctx, meta) {
  let tab = "words";
  let filter = "studying";

  const draw = async () => {
    const { sourceId, label } = meta;

    if (sourceNeedsMaterialize(ctx.state, sourceId)) {
      const dict = await getDictionary();
      const phrasesDb = await getPhrases();
      if (ensureSnapshotItems(ctx.state, sourceId, dict, phrasesDb)) {
        ctx.save();
      }
    }

    const readiness = calcReadiness(ctx.state, sourceId);
    const snapshot = getSnapshotEntries(ctx.state, sourceId);
    const entries = tab === "words" ? snapshot.words : snapshot.phrases;
    const filtered = entries.filter((e) => e.status === filter);
    const isEpisode = meta.backRoute === "shows";
    const filterCounts = getFilterCounts(entries);
    const readyBadgeHtml = readiness.total
      ? `<span class="source-badge source-vocab-ready-badge">${readinessBadge(readiness)}</span>`
      : "";

    el.innerHTML = `
      <div class="page source-vocab-page">
        <div class="source-vocab-top">
          <button type="button" class="btn btn-sm outline" id="source-vocab-back">← Назад</button>
          ${readyBadgeHtml}
        </div>
        <h1 class="view-title view-title-section source-vocab-title">${esc(label)}</h1>

        ${!readiness.total ? `
          <div class="card card-padded list-empty">
            Нет данных о лексике. Импортируйте ${isEpisode ? "субтитры .srt" : "текст .txt"} для этого источника.
          </div>` : `
          <div class="source-vocab-sticky">
            <div class="tabs source-vocab-kind-tabs">
              <button type="button" class="tab-btn${tab === "words" ? " active" : ""}" data-tab="words">Слова (${snapshot.words.length})</button>
              <button type="button" class="tab-btn${tab === "phrases" ? " active" : ""}" data-tab="phrases">Выражения (${snapshot.phrases.length})</button>
            </div>

            <div class="tabs source-vocab-filter-tabs">
              ${STATUS_FILTERS.map((f) => filterTabBtnHtml(f, filterCounts[f.id] ?? 0, filter === f.id)).join("")}
            </div>

            <div class="source-vocab-colhead-wrap">
              <table class="list-table list-table-compact source-vocab-colhead-table">
                <thead><tr>
                  <th class="col-word">${tab === "words" ? "Слово" : "Выражение"}</th>
                  <th class="col-trans-cell">Переводы</th>
                  <th class="col-actions"></th>
                </tr></thead>
              </table>
            </div>
          </div>

          <div class="card list-card source-vocab-list-card">
            <div class="list-table-wrap">
              <table class="list-table list-table-compact">
                <tbody>${filtered.length
                  ? filtered.map((e) => entryRow(e, ctx.state)).join("")
                  : `<tr><td colspan="3" class="empty-row">Нет элементов в этой категории</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>`}
      </div>`;

    el.querySelector("#source-vocab-back")?.addEventListener("click", () => {
      ctx.closeSourceVocab?.();
    });

    el.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.tab;
        filter = "studying";
        draw();
      });
    });

    el.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        draw();
      });
    });

    bindTransChipsContainers(el, {
      onChange(chipId, translations) {
        handleTranslationChange(ctx, meta, chipId, translations, draw);
      },
    });
    bindRowActions(el, ctx, draw);
    bindScrollTop();
  };

  draw();
}

function getFilterCounts(entries) {
  const counts = { known: 0, studying: 0, stop: 0, noTrans: 0 };
  for (const e of entries) {
    if (e.status in counts) counts[e.status]++;
  }
  return counts;
}

function filterTabBtnHtml(f, count, active) {
  const cls = FILTER_TAB_CLS[f.id];
  return `
    <button type="button" class="tab-btn tab-btn-sm tab-btn-stat ${cls}${active ? " active" : ""}" data-filter="${f.id}">
      <span class="tab-btn-label">${f.label}</span>
      <span class="tab-btn-num">${count}</span>
    </button>`;
}

function entryRow(entry, state) {
  const keyAttr = escAttr(entry.key);
  const itemId = entry.item?.id ? escAttr(entry.item.id) : "";

  return `
    <tr data-kind="${entry.kind}" data-key="${keyAttr}" data-status="${entry.status}"${itemId ? ` data-item-id="${itemId}"` : ""}>
      <td class="col-word"><strong>${esc(titleCase(entry.key))}</strong></td>
      <td class="col-trans-cell">${transCellHtml(entry, state)}</td>
      <td class="col-actions">
        <div class="row-actions">${actionButtons(entry)}</div>
      </td>
    </tr>`;
}

function canEditTranslations(entry) {
  if (entry.status === "stop") return false;
  if (entry.item?.id) return true;
  return entry.status === "noTrans" || entry.status === "studying";
}

function transCellHtml(entry, state) {
  if (!canEditTranslations(entry)) {
    const trans = displayTranslations(state, entry);
    const transText = trans.length ? trans.map((t) => esc(titleCase(t))).join(" · ") : "—";
    return `<span class="sv-trans">${transText}</span>`;
  }

  const trans = (entry.item?.translations || []).filter(Boolean);
  return transChipsHtml(trans, { id: transChipId(entry) });
}

function displayTranslations(state, entry) {
  if (entry.status === "stop" && entry.kind === "word") {
    const l = entry.key.toLowerCase().trim();
    const stopEntry = (state.settings?.stopList || []).find((x) => {
      const lemma = typeof x === "string" ? x : x?.lemma;
      return String(lemma ?? "").toLowerCase().trim() === l;
    });
    if (stopEntry && typeof stopEntry === "object") {
      return (stopEntry.translations || []).filter(Boolean);
    }
    return [];
  }
  return (entry.item?.translations || []).filter(Boolean);
}

function transChipId(entry) {
  if (entry.item?.id) return entry.item.id;
  return `sv-pending:${entry.kind}:${encodeURIComponent(entry.key)}`;
}

function parsePendingChipId(chipId) {
  const m = /^sv-pending:(word|phrase):(.+)$/.exec(chipId);
  if (!m) return null;
  return { kind: m[1], key: decodeURIComponent(m[2]) };
}

function handleTranslationChange(ctx, meta, chipId, translations, redraw) {
  const word = findWordById(ctx.state, chipId);
  if (word) {
    updateWord(ctx.state, chipId, { translations });
    ctx.save();
    redraw();
    return;
  }

  const phrase = findPhraseById(ctx.state, chipId);
  if (phrase) {
    updatePhrase(ctx.state, chipId, { translations });
    ctx.save();
    redraw();
    return;
  }

  const pending = parsePendingChipId(chipId);
  if (!pending) return;

  if (pending.kind === "word") {
    const existing = findWordByLemma(ctx.state, pending.key);
    if (existing) {
      updateWord(ctx.state, existing.id, { translations });
    } else {
      addWords(ctx.state, [{ lemma: pending.key, translations }], meta.sourceId);
    }
  } else {
    const existing = findPhraseByText(ctx.state, pending.key);
    if (existing) {
      updatePhrase(ctx.state, existing.id, { translations });
    } else {
      addPhrases(ctx.state, [{ text: pending.key, translations }], meta.sourceId);
    }
  }

  ctx.save();
  redraw();
}

function actionButtons(entry) {
  const key = escAttr(entry.key);
  const kind = entry.kind;
  const id = entry.item?.id ? ` data-id="${escAttr(entry.item.id)}"` : "";

  if (entry.status === "studying" && entry.item) {
    const stop = kind === "word"
      ? btnStopList(`data-act="stop" data-kind="${kind}" data-key="${key}"${id}`)
      : "";
    return `${btnLearned(`data-act="learn" data-kind="${kind}" data-key="${key}"${id}`)}${stop}`;
  }

  if (entry.status === "known") {
    return btnReturnStudy(`data-act="return" data-kind="${kind}" data-key="${key}"${id}`);
  }

  if (entry.status === "stop" && kind === "word") {
    return btnReturnStudy(`data-act="return-stop" data-kind="word" data-key="${key}"`);
  }

  if (entry.status === "noTrans" && entry.item) {
    return btnReturnStudy(`data-act="return" data-kind="${kind}" data-key="${key}"${id}`);
  }

  return "";
}

function bindRowActions(el, ctx, redraw) {
  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.kind;
      const key = btn.dataset.key;
      const act = btn.dataset.act;

      if (act === "learn") {
        if (kind === "word") markWordLearned(ctx.state, btn.dataset.id);
        else markPhraseLearned(ctx.state, btn.dataset.id);
      } else if (act === "stop") {
        deleteWord(ctx.state, btn.dataset.id);
      } else if (act === "return") {
        if (kind === "word") returnWordToStudy(ctx.state, key);
        else returnPhraseToStudy(ctx.state, key);
      } else if (act === "return-stop") {
        returnStopWordToStudy(ctx.state, key);
      }

      ctx.save();
      redraw();
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
