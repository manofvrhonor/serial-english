import { renderImport } from "./views/import.js";
import { renderWords } from "./views/words.js";
import { renderPhrases } from "./views/phrases.js";
import { renderTraining } from "./views/training.js";
import { renderShows } from "./views/shows.js";
import { renderBooks } from "./views/books.js";
import { renderKnowledge } from "./views/knowledge.js";
import { renderSettings } from "./views/settings.js";

// Карта: имя маршрута → функция отрисовки
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

const content = document.getElementById("content");

// Контекст приложения { state, save } — приходит из app.js
let appCtx = null;

// Показать раздел по имени; options.trainingPrep — подготовка к серии/главе
export function navigateTo(route, options = {}) {
  const render = routes[route];
  if (!render) return;

  if (options.trainingPrep) {
    appCtx.trainingPrep = options.trainingPrep;
  } else if (route !== "training") {
    appCtx.trainingPrep = null;
  }

  render(content, appCtx);

  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
}

export function startPrepTraining(sourceId, label) {
  navigateTo("training", {
    trainingPrep: { sourceId, label },
  });
}

// Навесить обработчики на пункты меню
export function initRouter(ctx) {
  appCtx = ctx;

  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.route));
  });

  // Стартовый раздел
  navigateTo("import");
}