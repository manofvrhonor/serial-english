import { calcReadiness, calcReadinessForSources, progressBarHtml, episodeLabel } from "../core/readiness.js";
import { startPrepTraining } from "../router.js";

export function renderShows(el, ctx) {
  const shows = ctx.state.shows || [];

  if (!shows.length) {
    el.innerHTML = `
      <div class="page">
      <h1 class="view-title">Сериалы</h1>
      <p class="view-subtitle">Вложенность: Сериал → Сезон → Серия.</p>
      <div class="card card-padded list-empty">
        Пока нет сериалов. Импортируйте файл <b>.srt</b> в разделе «Импорт» —
        сериал, сезон и серия создадутся автоматически.
      </div>
      </div>`;
    return;
  }

  const cards = shows.map((show) => renderShowCard(ctx, show)).join("");

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">Сериалы</h1>
    <p class="view-subtitle">Готовность = выученные / все слова и выражения серии.</p>
    <div class="source-cards">${cards}</div>
    </div>`;

  el.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      startPrepTraining(btn.dataset.source, btn.dataset.label);
    });
  });
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
        <span class="source-badge">${readiness.learned}/${readiness.total} изучено</span>
      </div>
      ${progressBarHtml(readiness, true)}
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

  return `
    <div class="source-ep-card">
      <div class="source-ep-head">
        <span class="source-ep-label">${esc(label)}</span>
        <span class="source-ep-count">${readiness.learned}/${readiness.total}</span>
      </div>
      <div class="prog-bar prog-bar-thin" title="${readiness.learned} из ${readiness.total}">
        <div class="prog-fill" style="width:${readiness.percent}%"></div>
      </div>
      <button type="button" class="btn btn-sm tree-prep-btn source-prep-btn" data-source="${escAttr(ep.id)}" data-label="${escAttr(fullLabel)}"
        ${canPrep ? "" : "disabled title=\"Всё выучено\""}>
        Подготовка к просмотру
      </button>
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
