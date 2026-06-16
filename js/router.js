import { renderImport } from "./views/import.js?v=20260624";
import { renderKnowledge } from "./views/knowledge.js?v=20260624";
import { renderTraining } from "./views/training.js?v=20260624";
import { renderShows } from "./views/shows.js?v=20260624";
import { renderBooks } from "./views/books.js?v=20260624";
import { renderSettings } from "./views/settings.js?v=20260624";

const routes = {
  import: renderImport,
  knowledge: renderKnowledge,
  training: renderTraining,
  shows: renderShows,
  books: renderBooks,
  settings: renderSettings,
  words: renderKnowledge,
  phrases: renderKnowledge,
};

const ROUTE_LABELS = {
  import: "Импорт",
  knowledge: "База знаний",
  training: "Тренировка",
  shows: "Сериалы",
  books: "Книги",
  settings: "Настройки",
  words: "База знаний",
  phrases: "База знаний",
};

const MOBILE_PRIMARY = new Set(["import", "knowledge", "training", "shows"]);

const content = document.getElementById("content");
let appCtx = null;

function setActiveNav(route) {
  const navRoute = route === "words" || route === "phrases" ? "knowledge" : route;

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === navRoute);
  });

  document.querySelectorAll(".mobile-nav-item[data-action='more']").forEach((el) => {
    el.classList.toggle("active", !MOBILE_PRIMARY.has(navRoute));
  });

  const title = document.getElementById("mobile-page-title");
  if (title) title.textContent = ROUTE_LABELS[route] || "Serial English";
}

function openMobileMore() {
  const sheet = document.getElementById("mobile-more");
  if (sheet) sheet.hidden = false;
}

function closeMobileMore() {
  const sheet = document.getElementById("mobile-more");
  if (sheet) sheet.hidden = true;
}

export function navigateTo(route, options = {}) {
  const render = routes[route];
  if (!render || !content || !appCtx) return;

  if (options.trainingPrep) {
    appCtx.trainingPrep = options.trainingPrep;
  } else if (route !== "training") {
    appCtx.trainingPrep = null;
  }

  try {
    render(content, appCtx);
    setActiveNav(route);
    closeMobileMore();
  } catch (err) {
    console.error(`Route "${route}" failed:`, err);
    content.innerHTML = `
      <div class="page">
        <h1 class="view-title">Ошибка загрузки</h1>
        <p class="settings-msg settings-msg-err">${esc(String(err?.message || err))}</p>
        <button type="button" class="btn btn-sm" onclick="location.reload()">Обновить страницу</button>
      </div>`;
    setActiveNav(route);
    closeMobileMore();
  }
}

export function startPrepTraining(sourceId, label) {
  navigateTo("training", {
    trainingPrep: { sourceId, label },
  });
}

function bindNavItem(el) {
  el.addEventListener("click", () => {
    if (!el.dataset.route) return;
    navigateTo(el.dataset.route);
  });
}

function initShell() {
  document.querySelectorAll(".menu-item[data-route]").forEach(bindNavItem);
  document.querySelectorAll(".mobile-nav-item[data-route]").forEach(bindNavItem);
  document.querySelectorAll(".mobile-more-item[data-route]").forEach(bindNavItem);

  document.querySelectorAll(".mobile-nav-item[data-action='more']").forEach((btn) => {
    btn.addEventListener("click", openMobileMore);
  });

  document.getElementById("mobile-more-backdrop")?.addEventListener("click", closeMobileMore);

  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.getElementById("app")?.classList.toggle("sidebar-collapsed");
  });
}

export function initRouter(ctx) {
  appCtx = ctx;
  initShell();
  navigateTo("import");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
