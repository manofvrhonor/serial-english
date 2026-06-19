import { renderImport } from "./views/import.js?v=20260721";

import { renderKnowledge } from "./views/knowledge.js?v=20260721";

import { renderTraining } from "./views/training.js?v=20260721";

import { renderShows } from "./views/shows.js?v=20260721";

import { renderBooks } from "./views/books.js?v=20260721";

import { renderSettings } from "./views/settings.js?v=20260721";

import { refreshPageScrollTop } from "./ui/scroll-top.js?v=20260721";



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



const content = document.getElementById("content");

let appCtx = null;



function setActiveNav(route) {

  const navRoute = route === "words" || route === "phrases" ? "knowledge" : route;



  document.querySelectorAll("[data-route]").forEach((el) => {

    el.classList.toggle("active", el.dataset.route === navRoute);

  });

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

    refreshPageScrollTop(route);

  } catch (err) {

    console.error(`Route "${route}" failed:`, err);

    content.innerHTML = `

      <div class="page">

        <h1 class="view-title">Ошибка загрузки</h1>

        <p class="settings-msg settings-msg-err">${esc(String(err?.message || err))}</p>

        <button type="button" class="btn btn-sm" onclick="location.reload()">Обновить страницу</button>

      </div>`;

    setActiveNav(route);

    refreshPageScrollTop(route);

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



  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {

    const app = document.getElementById("app");

    const btn = document.getElementById("sidebar-toggle");

    const collapsed = app?.classList.toggle("sidebar-collapsed");

    if (btn) {

      btn.setAttribute("aria-label", collapsed ? "Развернуть меню" : "Свернуть меню");

      const label = btn.querySelector(".nav-label");

      if (label) label.textContent = collapsed ? "Развернуть меню" : "Свернуть меню";

    }

  });

}



export function initRouter(ctx) {

  appCtx = ctx;

  ctx.navigateTo = (route) => navigateTo(route);

  ctx.startPrepTraining = (sourceId, label) => {

    navigateTo("training", {

      trainingPrep: { sourceId, label },

    });

  };

  initShell();

  navigateTo("import");

}



function esc(s) {

  return String(s ?? "").replace(/[&<>"']/g, (c) => ({

    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",

  }[c]));

}

