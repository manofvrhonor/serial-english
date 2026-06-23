import { mountImportSection } from "./import.js?v=20260669";
import { mountShowsContent } from "./shows.js?v=20260666";
import { mountBooksContent } from "./books.js?v=20260666";
import { renderSourceVocab } from "./source-vocab.js?v=20260666";

export async function renderCatalog(el, ctx, options = {}) {
  if (options.catalogTab) ctx.catalogTab = options.catalogTab;
  if (!ctx.catalogTab) ctx.catalogTab = "shows";

  const back = ctx.sourceVocab?.backRoute;
  if (back === "shows" || back === "books") {
    renderSourceVocab(el, ctx, ctx.sourceVocab);
    return;
  }

  const tab = ctx.catalogTab;

  el.innerHTML = `
    <div class="page catalog-page">
      <h1 class="view-title view-title-section">Каталог</h1>

      <div id="catalog-import" class="catalog-import"></div>

      <div class="tabs catalog-kind-tabs" role="tablist">
        <button type="button" class="tab-btn${tab === "shows" ? " active" : ""}" data-catalog-tab="shows">Сериалы</button>
        <button type="button" class="tab-btn${tab === "books" ? " active" : ""}" data-catalog-tab="books">Книги</button>
      </div>

      <div id="catalog-sources" class="catalog-sources"></div>
    </div>`;

  mountImportSection(el.querySelector("#catalog-import"), ctx);

  el.querySelectorAll("[data-catalog-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.catalogTab === ctx.catalogTab) return;
      ctx.catalogTab = btn.dataset.catalogTab;
      el.querySelectorAll("[data-catalog-tab]").forEach((b) => {
        b.classList.toggle("active", b.dataset.catalogTab === ctx.catalogTab);
      });
      renderCatalogSources(el, ctx);
    });
  });

  await renderCatalogSources(el, ctx);
}

async function renderCatalogSources(el, ctx) {
  const mount = el.querySelector("#catalog-sources");
  if (!mount) return;
  if (ctx.catalogTab === "books") await mountBooksContent(mount, ctx);
  else await mountShowsContent(mount, ctx);
}
