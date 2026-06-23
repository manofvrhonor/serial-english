import {
  calcReadiness,
  calcReadinessForSources,
  episodeLabel,
  snapshotProgressBarHtml,
  readinessBadge,
  ensureSnapshotItems,
  sourceNeedsMaterialize,
} from "../core/readiness.js";
import { renderSourceVocab } from "./source-vocab.js?v=20260653";
import { getDictionary } from "../import/dictionary.js";
import { getPhrases } from "../import/phrases.js";

async function materializeSnapshots(ctx, sourceIds) {
  const pending = sourceIds.filter((id) => sourceNeedsMaterialize(ctx.state, id));
  if (!pending.length) return;

  const dict = await getDictionary();
  const phrasesDb = await getPhrases();
  let changed = false;
  for (const id of pending) {
    if (ensureSnapshotItems(ctx.state, id, dict, phrasesDb)) changed = true;
  }
  if (changed) ctx.save();
}

function collectEpisodeIds(state) {
  const ids = [];
  for (const show of state.shows || []) {
    for (const season of show.seasons || []) {
      for (const ep of season.episodes || []) ids.push(ep.id);
    }
  }
  return ids;
}

export async function mountShowsContent(mountEl, ctx) {
  await materializeSnapshots(ctx, collectEpisodeIds(ctx.state));

  const shows = ctx.state.shows || [];

  if (!shows.length) {
    mountEl.innerHTML = `
      <div class="card card-padded list-empty">
        Пока нет сериалов. Загрузите файл <b>.srt</b> выше —
        сериал, сезон и серия создадутся автоматически.
      </div>`;
    return;
  }

  const cards = shows.map((show) => renderShowCard(ctx, show)).join("");

  mountEl.innerHTML = `<div class="source-cards">${cards}</div>`;

  mountEl.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      ctx.startPrepTraining?.(btn.dataset.source, btn.dataset.label);
    });
  });

  mountEl.querySelectorAll(".source-vocab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.openSourceVocab?.(btn.dataset.source, btn.dataset.label, "shows");
    });
  });
}

export async function renderShows(el, ctx) {
  if (ctx.sourceVocab?.backRoute === "shows") {
    await materializeSnapshots(ctx, [ctx.sourceVocab.sourceId]);
    renderSourceVocab(el, ctx, ctx.sourceVocab);
    return;
  }

  el.innerHTML = `
    <div class="page">
      <h1 class="view-title view-title-section">Сериалы</h1>
      <div id="shows-mount"></div>
    </div>`;
  await mountShowsContent(el.querySelector("#shows-mount"), ctx);
}

function renderShowCard(ctx, show) {
  const epIds = [];
  for (const season of show.seasons || []) {
    for (const ep of season.episodes || []) epIds.push(ep.id);
  }
  const readiness = calcReadinessForSources(ctx.state, epIds);

  const seasons = (show.seasons || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => renderSeasonBlock(ctx, show, s))
    .join("");

  return `
    <article class="card card-padded source-card">
      <div class="source-card-header">
        <span class="source-card-icon" aria-hidden="true">📺</span>
        <h2 class="source-card-title">${esc(show.title)}</h2>
        <span class="source-badge">${readinessBadge(readiness)}</span>
      </div>
      <div class="source-body">${seasons || `<p class="source-empty">Нет сезонов</p>`}</div>
    </article>`;
}

function renderSeasonBlock(ctx, show, season) {
  const episodes = (season.episodes || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((ep) => renderEpisodeCard(ctx, show, season, ep))
    .join("");

  return `
    <div class="source-season">
      <div class="source-season-label">Сезон ${season.number}</div>
      <div class="source-ep-grid">${episodes || `<p class="source-empty">Нет серий</p>`}</div>
    </div>`;
}

function renderEpisodeCard(ctx, show, season, ep) {
  const readiness = calcReadiness(ctx.state, ep.id);
  const label = episodeLabel(season, ep);
  const fullLabel = `${show.title} · ${label}`;
  const canPrep = readiness.unlearned > 0;
  const hasVocab = readiness.total > 0;

  return `
    <div class="source-ep-card">
      <div class="source-ep-head">
        <span class="source-ep-label">${esc(label)}</span>
        <span class="source-ep-badge">${readinessBadge(readiness)}</span>
      </div>
      ${snapshotProgressBarHtml(readiness)}
      <div class="source-ep-actions">
        <button type="button" class="btn btn-sm outline source-vocab-btn" data-source="${escAttr(ep.id)}" data-label="${escAttr(fullLabel)}"
          ${hasVocab ? "" : "disabled title=\"Нет снимка лексики\""}>
          Словарь серии
        </button>
        <button type="button" class="btn btn-sm tree-prep-btn source-prep-btn" data-source="${escAttr(ep.id)}" data-label="${escAttr(fullLabel)}"
          ${canPrep ? "" : "disabled title=\"Всё готово\""}>
          Подготовка к просмотру
        </button>
      </div>
    </div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
