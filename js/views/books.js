import {
  calcReadiness,
  calcReadinessForSources,
  chapterLabel,
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

export async function renderBooks(el, ctx) {
  if (ctx.sourceVocab?.backRoute === "books") {
    await materializeSnapshots(ctx, [ctx.sourceVocab.sourceId]);
    renderSourceVocab(el, ctx, ctx.sourceVocab);
    return;
  }

  const chIds = (ctx.state.books || []).flatMap((b) => (b.chapters || []).map((c) => c.id));
  await materializeSnapshots(ctx, chIds);

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
    <div class="source-cards">${cards}</div>
    </div>`;

  el.querySelectorAll(".tree-prep-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      ctx.startPrepTraining?.(btn.dataset.source, btn.dataset.label);
    });
  });

  el.querySelectorAll(".source-vocab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.openSourceVocab?.(btn.dataset.source, btn.dataset.label, "books");
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
        <span class="source-badge">${readinessBadge(readiness)}</span>
      </div>
      <div class="source-ep-grid">${chapters || `<p class="source-empty">Нет глав</p>`}</div>
    </article>`;
}

function renderChapterCard(ctx, book, ch) {
  const readiness = calcReadiness(ctx.state, ch.id);
  const label = chapterLabel(ch);
  const fullLabel = `${book.title} · ${label}`;
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
        <button type="button" class="btn btn-sm outline source-vocab-btn" data-source="${escAttr(ch.id)}" data-label="${escAttr(fullLabel)}"
          ${hasVocab ? "" : "disabled title=\"Нет снимка лексики\""}>
          Словарь главы
        </button>
        <button type="button" class="btn btn-sm tree-prep-btn source-prep-btn" data-source="${escAttr(ch.id)}" data-label="${escAttr(fullLabel)}"
          ${canPrep ? "" : "disabled title=\"Всё готово\""}>
          Подготовка к чтению
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
