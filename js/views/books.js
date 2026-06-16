import { calcReadiness, calcReadinessForSources, progressBarHtml, chapterLabel } from "../core/readiness.js";

export function renderBooks(el, ctx) {
  const books = ctx.state.books || [];

  if (!books.length) {
    el.innerHTML = `
      <div class="page">
      <h1 class="view-title view-title-section">Книги</h1>
      <p class="view-subtitle">Вложенность: Книга → Глава.</p>
      <div class="card card-padded list-empty">
        Пока нет книг. Импортируйте файл <b>.txt</b> в разделе «Импорт» —
        книга и глава создадутся автоматически.
      </div>
      </div>`;
    return;
  }

  const cards = books.map((book) => renderBookCard(ctx, book)).join("");

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title view-title-section">Книги</h1>
    <p class="view-subtitle">Готовность = выученные / все слова и выражения главы.</p>
    <div class="source-cards">${cards}</div>
    </div>`;

  el.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      ctx.startPrepTraining?.(btn.dataset.source, btn.dataset.label);
    });
  });
}

function renderBookCard(ctx, book) {
  const chIds = (book.chapters || []).map((c) => c.id);
  const readiness = calcReadinessForSources(ctx.state, chIds);

  const chapters = (book.chapters || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((ch) => renderChapterCard(ctx, book, ch))
    .join("");

  return `
    <article class="card card-padded source-card">
      <div class="source-card-header">
        <span class="source-card-icon" aria-hidden="true">📚</span>
        <h2 class="source-card-title">${esc(book.title)}</h2>
        <span class="source-badge">${readiness.learned}/${readiness.total} изучено</span>
      </div>
      ${progressBarHtml(readiness, true)}
      <div class="source-ep-grid">${chapters || `<p class="source-empty">Нет глав</p>`}</div>
    </article>`;
}

function renderChapterCard(ctx, book, ch) {
  const readiness = calcReadiness(ctx.state, ch.id);
  const label = chapterLabel(ch);
  const fullLabel = `${book.title} · ${label}`;
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
      <button type="button" class="btn btn-sm tree-prep-btn source-prep-btn" data-source="${escAttr(ch.id)}" data-label="${escAttr(fullLabel)}"
        ${canPrep ? "" : "disabled title=\"Всё выучено\""}>
        Подготовка к чтению
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
