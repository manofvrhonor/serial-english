import {
  calcReadiness,
  getSnapshotEntries,
  readinessBadge,
  ensureSnapshotItems,
  sourceNeedsMaterialize,
} from "../core/readiness.js";
import {
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
import { bindScrollTop } from "../ui/scroll-top.js";

const STATUS_FILTERS = [
  { id: "known", label: "Выучено" },
  { id: "studying", label: "На изучении" },
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
    const statsHtml = renderStatsSection(readiness);

    el.innerHTML = `
      <div class="page source-vocab-page">
        <div class="source-vocab-top">
          <button type="button" class="btn btn-sm outline" id="source-vocab-back">← Назад</button>
          <h1 class="view-title view-title-section source-vocab-title">${esc(label)}</h1>
        </div>

        ${statsHtml ? `
        <section class="card card-padded source-vocab-stats">
          ${statsHtml}
        </section>` : ""}

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
              ${STATUS_FILTERS.map((f) => `
                <button type="button" class="tab-btn tab-btn-sm ${FILTER_TAB_CLS[f.id]}${filter === f.id ? " active" : ""}" data-filter="${f.id}">${f.label}</button>
              `).join("")}
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
                  ? filtered.map((e) => entryRow(e)).join("")
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

    bindRowActions(el, ctx, draw);
    bindScrollTop();
  };

  draw();
}

function renderStatsSection(readiness) {
  if (!readiness.total) return "";
  const tags = snapshotStatusTags(readiness);
  return `
    <div class="source-vocab-stats-head">
      <span class="source-badge">${readinessBadge(readiness)}</span>
    </div>
    ${tags}`;
}

function snapshotStatusTags(readiness) {
  if (!readiness.hasSnapshot) return "";
  const parts = [];
  if (readiness.studying) parts.push(`<span class="sv-stat sv-stat-work">на изучении ${readiness.studying}</span>`);
  if (readiness.known) parts.push(`<span class="sv-stat sv-stat-known">выучено ${readiness.known}</span>`);
  if (readiness.stop) parts.push(`<span class="sv-stat sv-stat-stop">стоп ${readiness.stop}</span>`);
  if (readiness.noTrans) parts.push(`<span class="sv-stat sv-stat-notrans">без перевода ${readiness.noTrans}</span>`);
  if (!parts.length) return "";
  return `<div class="source-vocab-breakdown">${parts.join("")}</div>`;
}

function entryRow(entry) {
  const trans = (entry.item?.translations || []).filter(Boolean);
  const transText = trans.length ? trans.map((t) => esc(t)).join(" · ") : "—";
  const keyAttr = escAttr(entry.key);

  return `
    <tr data-kind="${entry.kind}" data-key="${keyAttr}" data-status="${entry.status}">
      <td class="col-word"><strong>${esc(entry.key)}</strong></td>
      <td class="col-trans-cell sv-trans">${transText}</td>
      <td class="col-actions">
        <div class="row-actions">${actionButtons(entry)}</div>
      </td>
    </tr>`;
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
