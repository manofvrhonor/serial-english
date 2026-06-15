import { renderImport } from "./views/import.js";
import { renderWords } from "./views/words.js";
import { renderPhrases } from "./views/phrases.js";
import { renderTraining } from "./views/training.js";
import { renderShows } from "./views/shows.js";
import { renderBooks } from "./views/books.js";
import { renderKnowledge } from "./views/knowledge.js";
import { renderSettings } from "./views/settings.js";

const routes = {
  import: renderImport,
  words: renderWords,
  phrases: renderPhrases,
  training: renderTraining,
  shows: renderShows,
  books: renderBooks,
  knowledge: renderKnowledge,
  settings: renderSettings,
};

const ROUTE_LABELS = {
  import: "Импорт",
  words: "Слова",
  phrases: "Выражения",
  training: "Тренировка",
  shows: "Сериалы",
  books: "Книги",
  knowledge: "База знаний",
  settings: "Настройки",
};

const MOBILE_PRIMARY = new Set(["import", "words", "training", "shows"]);

const content = document.getElementById("content");
let appCtx = null;

function setActiveNav(route) {
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === route);
  });

  document.querySelectorAll(".mobile-nav-item[data-action='more']").forEach((el) => {
    el.classList.toggle("active", !MOBILE_PRIMARY.has(route));
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
  if (!render) return;

  if (options.trainingPrep) {
    appCtx.trainingPrep = options.trainingPrep;
  } else if (route !== "training") {
    appCtx.trainingPrep = null;
  }

  render(content, appCtx);
  setActiveNav(route);
  closeMobileMore();
}

export function startPrepTraining(sourceId, label) {
  navigateTo("training", {
    trainingPrep: { sourceId, label },
  });
}

function bindNavItem(el) {
  el.addEventListener("click", () => navigateTo(el.dataset.route));
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
