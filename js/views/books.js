import { calcReadiness, calcReadinessForSources, progressBarHtml, chapterLabel } from "../core/readiness.js";
import { startPrepTraining } from "../router.js";

export function renderBooks(el, ctx) {
  const books = ctx.state.books || [];

  if (!books.length) {
    el.innerHTML = `
      <div class="page">
      <h1 class="view-title">Книги</h1>
      <p class="view-subtitle">Вложенность: Книга → Глава.</p>
      <div class="placeholder">
        Пока нет книг. Импортируйте файл <b>.txt</b> в разделе «Импорт» —
        книга и глава создадутся автоматически.
      </div>
      </div>`;
    return;
  }

  const tree = books.map((book) => renderBook(ctx, book)).join("");

  el.innerHTML = `
    <div class="page">
    <h1 class="view-title">Книги</h1>
    <p class="view-subtitle">Готовность = выученные / все слова и выражения главы.</p>
    <div class="tree">${tree}</div>
    </div>`;

  el.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      startPrepTraining(btn.dataset.source, btn.dataset.label);
    });
  });
}

function renderBook(ctx, book) {
  const chIds = (book.chapters || []).map((c) => c.id);
  const readiness = calcReadinessForSources(ctx.state, chIds);

  const chapters = (book.chapters || [])
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((ch) => renderChapter(ctx, book, ch))
    .join("");

  return `
    <details class="tree-block" open>
      <summary class="tree-summary tree-level-book">
        <span class="tree-icon">📚</span>
        <span class="tree-name">${esc(book.title)}</span>
        ${progressBarHtml(readiness, true)}
      </summary>
      <div class="tree-children">${chapters || `<div class="tree-empty">Нет глав</div>`}</div>
    </details>`;
}

function renderChapter(ctx, book, ch) {
  const readiness = calcReadiness(ctx.state, ch.id);
  const label = chapterLabel(ch);
  const fullLabel = `${book.title} · ${label}`;
  const canPrep = readiness.unlearned > 0;

  return `
    <div class="tree-leaf tree-chapter">
      <div class="tree-leaf-main">
        <span class="tree-icon">📄</span>
        <span class="tree-name">${esc(label)}</span>
        ${progressBarHtml(readiness)}
      </div>
      <button class="btn btn-sm tree-prep-btn" data-source="${escAttr(ch.id)}" data-label="${escAttr(fullLabel)}"
        ${canPrep ? "" : "disabled title=\"Всё выучено\""}>
        🎯 Подготовка к чтению
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
