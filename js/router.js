import { renderCatalog } from "./views/catalog.js?v=20260669";

import { renderKnowledge } from "./views/knowledge.js?v=20260666";

import { renderTraining } from "./views/training.js?v=20260671";

import { renderSettings } from "./views/settings.js?v=20260673";

import { renderAdminLibrary } from "./views/admin-library.js?v=20260666";

import { refreshPageScrollTop } from "./ui/scroll-top.js?v=20260666";

import { isAdminMode } from "./core/admin-gate.js";



const routes = {

  import: renderCatalog,

  shows: (el, ctx) => renderCatalog(el, ctx, { catalogTab: "shows" }),

  books: (el, ctx) => renderCatalog(el, ctx, { catalogTab: "books" }),

  knowledge: renderKnowledge,

  training: renderTraining,

  settings: renderSettings,

  "library-admin": renderAdminLibrary,

  words: renderKnowledge,

  phrases: renderKnowledge,

};



const content = document.getElementById("content");

let appCtx = null;



function setActiveNav(route) {

  const navRoute = route === "words" || route === "phrases" ? "knowledge"
    : route === "library-admin" ? "settings"
    : route === "shows" || route === "books" ? "import"
    : route;



  document.querySelectorAll("[data-route]").forEach((el) => {

    el.classList.toggle("active", el.dataset.route === navRoute);

  });

}



export function navigateTo(route, options = {}) {

  if (route === "library-admin" && !isAdminMode()) {
    route = "settings";
  }

  const render = routes[route];

  if (!render || !content || !appCtx) return;



  if (options.trainingPrep) {

    appCtx.trainingPrep = options.trainingPrep;

  } else if (route !== "training") {

    appCtx.trainingPrep = null;

  }

  if (options.sourceVocab) {
    appCtx.sourceVocab = options.sourceVocab;
    appCtx.catalogTab = options.sourceVocab.backRoute === "books" ? "books" : "shows";
  } else if (route === "import" || route === "shows" || route === "books") {
    appCtx.sourceVocab = null;
  }

  if (options.catalogTab) {
    appCtx.catalogTab = options.catalogTab;
  } else if (route === "shows") {
    appCtx.catalogTab = "shows";
  } else if (route === "books") {
    appCtx.catalogTab = "books";
  }



  try {

    render(content, appCtx);

    setActiveNav(route);

    refreshPageScrollTop(route === "shows" || route === "books" ? "import" : route);

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

  ctx.catalogTab = "shows";

  ctx.navigateTo = (route, options) => navigateTo(route, options);

  ctx.startPrepTraining = (sourceId, label) => {

    navigateTo("training", {

      trainingPrep: { sourceId, label },

    });

  };

  ctx.openSourceVocab = (sourceId, label, backRoute = "shows") => {

    navigateTo("import", {

      sourceVocab: { sourceId, label, backRoute },

    });

  };

  ctx.closeSourceVocab = () => {

    const back = appCtx.sourceVocab?.backRoute || "shows";

    appCtx.sourceVocab = null;

    appCtx.catalogTab = back === "books" ? "books" : "shows";

    navigateTo("import");

  };

  initShell();

  navigateTo("import");

}



function esc(s) {

  return String(s ?? "").replace(/[&<>"']/g, (c) => ({

    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",

  }[c]));

}
