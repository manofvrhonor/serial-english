import { calcReadiness, calcReadinessForSources, progressBarHtml, episodeLabel } from "../core/readiness.js";
import { startPrepTraining } from "../router.js";

export function renderShows(el, ctx) {
  const shows = ctx.state.shows || [];

  if (!shows.length) {
    el.innerHTML = `
      <div class="page">
      <h1 class="view-title">Сериалы</h1>
      <p class="view-subtitle">Вложенность: Сериал → Сезон → Серия.</p>
      <div class="placeholder">
        Пока нет сериалов. Импортируйте файл <b>.srt</b> в разделе «Импорт» —
        сериал, сезон и серия создадутся автоматически.
      </div>
      </div>`;
    return;
  }

  const tree = shows.map((show) => renderShow(ctx, show)).join("");

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">Сериалы</h1>
    <p class="view-subtitle">Готовность = выученные / все слова и выражения серии.</p>
    <div class="tree">${tree}</div>
    </div>`;

  el.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      startPrepTraining(btn.dataset.source, btn.dataset.label);
    });
  });
}

function renderShow(ctx, show) {
  const epIds = [];
  for (const season of show.seasons || []) {
    for (const ep of season.episodes || []) epIds.push(ep.id);
  }
  const readiness = calcReadinessForSources(ctx.state, epIds);

  const seasons = (show.seasons || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => renderSeason(ctx, show, s))
    .join("");

  return `
    <details class="tree-block" open>
      <summary class="tree-summary tree-level-show">
        <span class="tree-icon">📺</span>
        <span class="tree-name">${esc(show.title)}</span>
        ${progressBarHtml(readiness, true)}
      </summary>
      <div class="tree-children">${seasons || `<div class="tree-empty">Нет сезонов</div>`}</div>
    </details>`;
}

function renderSeason(ctx, show, season) {
  const epIds = (season.episodes || []).map((e) => e.id);
  const readiness = calcReadinessForSources(ctx.state, epIds);

  const episodes = (season.episodes || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((ep) => renderEpisode(ctx, show, season, ep))
    .join("");

  return `
    <details class="tree-block">
      <summary class="tree-summary tree-level-season">
        <span class="tree-icon">📂</span>
        <span class="tree-name">Сезон ${season.number}</span>
        ${progressBarHtml(readiness, true)}
      </summary>
      <div class="tree-children">${episodes || `<div class="tree-empty">Нет серий</div>`}</div>
    </details>`;
}

function renderEpisode(ctx, show, season, ep) {
  const readiness = calcReadiness(ctx.state, ep.id);
  const label = episodeLabel(season, ep);
  const fullLabel = `${show.title} · ${label}`;
  const canPrep = readiness.unlearned > 0;

  return `
    <div class="tree-leaf tree-episode">
      <div class="tree-leaf-main">
        <span class="tree-icon">🎬</span>
        <span class="tree-name">${esc(label)}</span>
        ${progressBarHtml(readiness)}
      </div>
      <button class="btn btn-sm tree-prep-btn" data-source="${escAttr(ep.id)}" data-label="${escAttr(fullLabel)}"
        ${canPrep ? "" : "disabled title=\"Всё выучено\""}>
        🎯 Подготовка к просмотру
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
