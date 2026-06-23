import { parseSrt, parseFileName } from "../core/parser.js";
import { analyzeText, analyzePhrases } from "../core/analyzer.js";
import { emptyState } from "../db/database.js";
import { getDictionary, getFormsIndex, translate } from "../import/dictionary.js";
import { getPhrases, translatePhrase } from "../import/phrases.js";
import { unzipFile, entryText, filterSrtEntries } from "../import/zip.js";
import { transChipsHtml, bindTransChipsContainers } from "../ui/trans-chips.js?v=20260621";
import { titleCase } from "../core/display-text.js";

const DRAFT_KEY = "se-admin-draft";

let draft = null;
let showUpload = false;
let epNameEdit = null;
let sel = { si: 0, ei: 0 };
let tab = "words";
let panelScope = "episode";
let queueTab = "pending";
let statusMsg = "";
let statusErr = false;

export function renderAdminLibrary(el, ctx) {
  const saved = migrateDraft(loadDraft());
  const hasDraft = Boolean(saved?.seasons?.length);

  if (!showUpload && hasDraft) {
    draft = saved;
    persistDraft();
    el.innerHTML = editorShell();
    bindCommon(el, ctx, "editor");
    bindEditor(el, ctx);
    drawEditor(el);
    return;
  }

  draft = saved;
  el.innerHTML = uploadShell();
  bindCommon(el, ctx, "upload");
  bindUpload(el, ctx);
}

// ---------- Shells ----------

function uploadShell() {
  return `
    <div class="page admin-library-page">
      <button type="button" class="btn btn-sm outline" id="admin-lib-back">← Назад</button>
      <h1 class="view-title view-title-section">Админ-библиотека</h1>
      <p class="view-subtitle">Загрузите zip с субтитрами (.srt) для авторинга набора сериала.</p>

      ${loadDraftHint()}

      <div class="card card-padded admin-upload-card">
        <label class="field-label field-full">
          <span>Название сериала</span>
          <input type="text" id="admin-show-title" placeholder="Friends" autocomplete="off" />
        </label>
        <label class="field-label field-full">
          <span>ID (латиница, для файла)</span>
          <input type="text" id="admin-show-id" placeholder="friends" autocomplete="off" />
        </label>
        <label class="import-filelabel admin-zip-label">
          <input type="file" id="admin-zip-input" accept=".zip,application/zip" multiple hidden />
          <span class="import-filebtn btn">Выбрать zip-архив(ы)</span>
        </label>
        <p id="admin-zip-names" class="settings-hint admin-zip-names">Файлы не выбраны</p>
        <button type="button" class="btn btn-lg" id="admin-process-btn" disabled>Обработать</button>
        <p id="admin-status" class="settings-msg" hidden></p>
      </div>
    </div>`;
}

function editorShell() {
  const epCount = countEpisodes(draft);
  return `
    <div class="page admin-library-page">
      <div class="admin-toolbar">
        <div class="admin-toolbar-row">
          <button type="button" class="btn btn-sm outline" id="admin-lib-back">← Назад</button>
          <button type="button" class="btn btn-sm outline" id="admin-new-draft">Новый набор</button>
          <button type="button" class="btn btn-sm btn-danger" id="admin-delete-draft" title="Удалить текущий набор из черновика">Удалить</button>
        </div>
        <div class="admin-toolbar-row admin-toolbar-row-exports">
          <button type="button" class="btn btn-sm secondary" id="admin-export-show">Экспорт show.json</button>
          <button type="button" class="btn btn-sm secondary" id="admin-export-index">Экспорт index.json</button>
        </div>
      </div>

      <h1 class="view-title view-title-section">Админ-библиотека</h1>

      <div class="card card-padded admin-meta-card">
        <div class="admin-meta-row">
          <label class="field-label">
            <span>Сериал</span>
            <input type="text" id="admin-edit-title" value="${esc(draft.showTitle)}" />
          </label>
          <label class="field-label">
            <span>ID</span>
            <input type="text" id="admin-edit-id" value="${esc(draft.showId)}" />
          </label>
        </div>
        <p class="admin-zip-extra">
          <span class="settings-hint">${epCount} серий в наборе.</span>
          <label class="admin-zip-link">
            <input type="file" id="admin-add-zip" accept=".zip,application/zip" multiple hidden />
            + ещё zip
          </label>
          <span class="settings-hint admin-zip-extra-hint">— другой сезон, серии добавятся к текущему</span>
        </p>
        <p id="admin-status" class="settings-msg ${statusErr ? "settings-msg-err" : "settings-msg-ok"}" ${statusMsg ? "" : "hidden"}>${esc(statusMsg)}</p>
      </div>

      <div class="admin-editor">
        <aside class="admin-ep-list card card-padded" id="admin-ep-list"></aside>
        <section class="admin-ep-panel card card-padded" id="admin-ep-panel"></section>
      </div>

      <div class="modal" id="admin-ep-name-modal" hidden>
        <div class="modal-backdrop" id="admin-ep-name-backdrop"></div>
        <div class="modal-card card card-padded" role="dialog" aria-labelledby="admin-ep-name-heading">
          <h2 class="settings-heading" id="admin-ep-name-heading">Название серии</h2>
          <p class="settings-hint" id="admin-ep-name-code"></p>
          <label class="field-label field-full">
            <span>Название</span>
            <input type="text" id="admin-ep-name-input" autocomplete="off" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn secondary" id="admin-ep-name-cancel">Отмена</button>
            <button type="button" class="btn" id="admin-ep-name-save">Сохранить</button>
          </div>
        </div>
      </div>
    </div>`;
}

function loadDraftHint() {
  const saved = loadDraft();
  if (!saved?.seasons?.length) return "";
  const title = saved.showTitle || saved.showId;
  return `
    <div class="card card-padded admin-resume-card">
      <p class="settings-hint">Текущий набор «${esc(title)}» (${countEpisodes(saved)} серий) сохранён.</p>
      <button type="button" class="btn btn-sm" id="admin-resume-draft">← Вернуться к «${esc(title)}»</button>
    </div>`;
}

// ---------- Upload flow ----------

function bindUpload(el, ctx) {
  const zipInput = el.querySelector("#admin-zip-input");
  const namesEl = el.querySelector("#admin-zip-names");
  const processBtn = el.querySelector("#admin-process-btn");
  const titleInp = el.querySelector("#admin-show-title");
  const idInp = el.querySelector("#admin-show-id");

  zipInput?.addEventListener("change", () => {
    const files = [...zipInput.files];
    namesEl.textContent = files.length
      ? files.map((f) => f.name).join(", ")
      : "Файлы не выбраны";
    processBtn.disabled = !files.length;
  });

  titleInp?.addEventListener("input", () => {
    if (!idInp.value.trim()) {
      idInp.placeholder = slugify(titleInp.value) || "friends";
    }
  });

  processBtn?.addEventListener("click", async () => {
    const files = [...zipInput.files];
    if (!files.length) return;
    const showTitle = titleInp.value.trim() || inferShowTitle(files[0]?.name);
    const showId = slugify(idInp.value.trim() || showTitle);
    await runProcess(el, ctx, files, showId, showTitle);
  });

  el.querySelector("#admin-resume-draft")?.addEventListener("click", () => {
    showUpload = false;
    draft = loadDraft();
    renderAdminLibrary(el, ctx);
  });
}

async function runProcess(el, ctx, files, showId, showTitle, mergeInto = null) {
  const statusEl = el.querySelector("#admin-status");

  if (!mergeInto) {
    const existing = loadDraft();
    if (existing?.seasons?.length) {
      const name = existing.showTitle || existing.showId;
      if (!window.confirm(`Заменить набор «${name}» новым? Текущий черновик будет перезаписан.`)) return;
    }
  }

  setStatus(el, "Обработка архивов…", false, statusEl);

  try {
    const next = mergeInto || emptyDraft(showId, showTitle);
    await ingestZips(next, files);
    sortDraft(next);
    migrateDraft(next);
    draft = next;
    sel = { si: 0, ei: 0 };
    tab = "words";
    panelScope = "episode";
    queueTab = "pending";
    statusMsg = `Готово: ${countEpisodes(draft)} серий`;
    statusErr = false;
    showUpload = false;
    persistDraft();
    renderAdminLibrary(el, ctx);
    requestAnimationFrame(() => focusEpPanel(el));
  } catch (err) {
    setStatus(el, err.message || String(err), true, statusEl);
  }
}

// ---------- Editor ----------

function bindEditor(el, ctx) {
  bindEpNameModal(el);

  el.querySelector("#admin-edit-title")?.addEventListener("change", (e) => {
    draft.showTitle = e.target.value.trim() || draft.showId;
    persistDraft();
    drawEpList(el);
  });

  el.querySelector("#admin-edit-id")?.addEventListener("change", (e) => {
    draft.showId = slugify(e.target.value.trim()) || draft.showId;
    e.target.value = draft.showId;
    persistDraft();
  });

  el.querySelector("#admin-add-zip")?.addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    await runProcess(el, ctx, files, draft.showId, draft.showTitle, draft);
  });

  el.querySelector("#admin-export-show")?.addEventListener("click", () => {
    downloadJson(`${draft.showId}.json`, buildShowJson(draft));
    flash(el, "Файл show.json скачан");
  });

  el.querySelector("#admin-export-index")?.addEventListener("click", async () => {
    try {
      const index = await mergeIndexJson(draft);
      downloadJson("index.json", index);
      flash(el, "Файл index.json скачан");
    } catch (err) {
      flash(el, err.message || String(err), true);
    }
  });

  el.querySelector("#admin-new-draft")?.addEventListener("click", () => {
    showUpload = true;
    statusMsg = "";
    renderAdminLibrary(el, ctx);
  });

  el.querySelector("#admin-delete-draft")?.addEventListener("click", () => {
    const title = draft.showTitle || draft.showId;
    const n = countEpisodes(draft);
    if (!window.confirm(`Удалить набор «${title}» (${n} серий)? Черновик будет стёрт без возможности восстановления.`)) return;
    clearDraft();
    draft = null;
    showUpload = true;
    statusMsg = "";
    statusErr = false;
    renderAdminLibrary(el, ctx);
  });
}

function bindCommon(el, ctx, mode) {
  el.querySelector("#admin-lib-back")?.addEventListener("click", () => {
    if (mode === "upload") {
      const saved = loadDraft();
      if (saved?.seasons?.length) {
        showUpload = false;
        draft = saved;
        renderAdminLibrary(el, ctx);
        return;
      }
    }
    ctx.navigateTo("settings");
  });
}

function drawEditor(el) {
  clampSelection();
  drawEpList(el);
  drawEpPanel(el);
}

function drawEpList(el) {
  const box = el.querySelector("#admin-ep-list");
  if (!box) return;

  const items = [];
  draft.seasons.forEach((season, si) => {
    const seasonActive = panelScope === "season" && si === sel.si;
    const pendingWords = countSeasonPending(si, "words");
    const pendingPhrases = countSeasonPending(si, "phrases");
    items.push(`
      <div class="admin-season-block">
        <div class="admin-season-head">
          <span class="admin-season-label">Сезон ${season.number}</span>
          <button type="button" class="btn btn-sm outline admin-season-all-btn ${seasonActive ? "active" : ""}" data-si="${si}">
            Все слова сезона
          </button>
        </div>
        <p class="admin-season-meta settings-hint">${pendingWords} сл · ${pendingPhrases} фр на обработку</p>
      </div>`);

    season.episodes.forEach((ep, ei) => {
      const active = panelScope === "episode" && si === sel.si && ei === sel.ei;
      const wc = ep.words.filter((w) => !w.removed).length;
      const pc = ep.phrases.filter((p) => !p.removed).length;
      items.push(`
        <div class="admin-ep-item ${active ? "active" : ""}" data-si="${si}" data-ei="${ei}">
          <div class="admin-ep-row">
            <span class="admin-ep-label">S${season.number}E${String(ep.number).padStart(2, "0")}</span>
            <button type="button" class="admin-ep-edit-name btn btn-sm outline">EDIT NAME</button>
            <span class="admin-ep-counts">${wc} сл · ${pc} фр</span>
          </div>
          <span class="admin-ep-title">${esc(ep.title || "—")}</span>
        </div>`);
    });
  });

  box.innerHTML = `
    <h2 class="settings-heading">Серии</h2>
    <div class="admin-ep-items">${items.join("") || `<p class="settings-empty">Нет серий</p>`}</div>`;

  box.querySelectorAll(".admin-season-all-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      sel = { si: +btn.dataset.si, ei: 0 };
      panelScope = "season";
      queueTab = "pending";
      drawEditor(el);
      focusEpPanel(el);
    });
  });

  box.querySelectorAll(".admin-ep-item").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".admin-ep-edit-name")) return;
      sel = { si: +row.dataset.si, ei: +row.dataset.ei };
      panelScope = "episode";
      drawEditor(el);
      focusEpPanel(el);
    });
  });

  box.querySelectorAll(".admin-ep-edit-name").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = btn.closest(".admin-ep-item");
      openEpNameModal(el, +row.dataset.si, +row.dataset.ei);
    });
  });
}

function bindEpNameModal(el) {
  const modal = el.querySelector("#admin-ep-name-modal");
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = "1";

  const input = el.querySelector("#admin-ep-name-input");
  const close = () => {
    modal.hidden = true;
    epNameEdit = null;
  };

  const save = () => {
    const target = epNameEdit;
    if (!target) return;
    const ep = draft.seasons[target.si]?.episodes[target.ei];
    if (!ep) {
      close();
      return;
    }
    ep.title = input.value.trim();
    persistDraft();
    close();
    drawEpList(el);
    if (sel.si === target.si && sel.ei === target.ei) drawEpPanel(el);
  };

  el.querySelector("#admin-ep-name-cancel")?.addEventListener("click", close);
  el.querySelector("#admin-ep-name-backdrop")?.addEventListener("click", close);
  el.querySelector("#admin-ep-name-save")?.addEventListener("click", save);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") close();
  });
}

function openEpNameModal(el, si, ei) {
  const season = draft.seasons[si];
  const ep = season?.episodes[ei];
  if (!ep) return;

  epNameEdit = { si, ei };
  const modal = el.querySelector("#admin-ep-name-modal");
  const code = el.querySelector("#admin-ep-name-code");
  const input = el.querySelector("#admin-ep-name-input");
  if (!modal || !input) return;

  if (code) {
    code.textContent = `S${season.number}E${String(ep.number).padStart(2, "0")}`;
  }
  input.value = ep.title || "";
  modal.hidden = false;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function focusEpPanel(el) {
  if (!window.matchMedia("(max-width: 640px)").matches) return;
  requestAnimationFrame(() => {
    el.querySelector("#admin-ep-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function drawEpPanel(el) {
  const box = el.querySelector("#admin-ep-panel");
  if (!box) return;

  if (panelScope === "season") {
    drawSeasonPanel(el, box);
    return;
  }

  const ep = currentEpisode();
  if (!ep) {
    box.innerHTML = `<p class="settings-empty">Выберите серию</p>`;
    return;
  }

  const season = draft.seasons[sel.si];
  const pendingWords = countEpisodePending(ep, "words");
  const doneWords = countEpisodeDone(ep, "words");
  const pendingPhrases = countEpisodePending(ep, "phrases");
  const donePhrases = countEpisodeDone(ep, "phrases");
  const pendingN = tab === "words" ? pendingWords : pendingPhrases;
  const doneN = tab === "words" ? doneWords : donePhrases;

  box.innerHTML = `
    <div class="admin-panel-head">
      <div>
        <h2 class="settings-heading admin-panel-title">S${season?.number ?? "?"}E${String(ep.number).padStart(2, "0")}</h2>
        <p class="settings-hint admin-panel-sub">${esc(ep.title || "—")}</p>
      </div>
      <button type="button" class="btn btn-sm outline" id="admin-open-season">Все слова сезона</button>
    </div>

    <div class="import-tabs admin-tabs">
      <button type="button" class="tab-btn ${tab === "words" ? "active" : ""}" data-tab="words">Слова</button>
      <button type="button" class="tab-btn ${tab === "phrases" ? "active" : ""}" data-tab="phrases">Фразы</button>
    </div>

    <div class="admin-queue-tabs">
      <button type="button" class="tab-btn ${queueTab === "pending" ? "active" : ""}" data-queue="pending">На обработку (${pendingN})</button>
      <button type="button" class="tab-btn ${queueTab === "done" ? "active" : ""}" data-queue="done">Готово (${doneN})</button>
    </div>

    ${adminBulkDoneRowHtml(ep)}

    <div id="admin-items-panel">${renderEpisodeItemsPanel(ep)}</div>

    <div class="admin-add-row">
      <input type="text" id="admin-add-text" placeholder="${tab === "words" ? "Добавить слово" : "Добавить фразу"}" autocomplete="off" />
      <button type="button" class="btn btn-sm" id="admin-add-btn">Добавить</button>
    </div>`;

  bindEpPanel(el, ep);
}

function drawSeasonPanel(el, box) {
  const season = draft.seasons[sel.si];
  if (!season) {
    box.innerHTML = `<p class="settings-empty">Сезон не найден</p>`;
    return;
  }

  const pendingWords = countSeasonPending(sel.si, "words");
  const doneWords = countSeasonDone(sel.si, "words");
  const pendingPhrases = countSeasonPending(sel.si, "phrases");
  const donePhrases = countSeasonDone(sel.si, "phrases");
  const pendingN = tab === "words" ? pendingWords : pendingPhrases;
  const doneN = tab === "words" ? doneWords : donePhrases;
  const uniqueWords = aggregateSeasonKind(draft, sel.si, "words").length;
  const uniquePhrases = aggregateSeasonKind(draft, sel.si, "phrases").length;

  box.innerHTML = `
    <div class="admin-panel-head">
      <div>
        <h2 class="settings-heading admin-panel-title">Сезон ${season.number} — все ${tab === "words" ? "слова" : "фразы"}</h2>
        <p class="settings-hint admin-panel-sub">${uniqueWords} уник. сл · ${uniquePhrases} уник. фр · ${season.episodes.length} серий</p>
      </div>
      <button type="button" class="btn btn-sm outline" id="admin-back-episode">← К серии</button>
    </div>

    <div class="import-tabs admin-tabs">
      <button type="button" class="tab-btn ${tab === "words" ? "active" : ""}" data-tab="words">Слова (${uniqueWords})</button>
      <button type="button" class="tab-btn ${tab === "phrases" ? "active" : ""}" data-tab="phrases">Фразы (${uniquePhrases})</button>
    </div>

    <div class="admin-queue-tabs">
      <button type="button" class="tab-btn ${queueTab === "pending" ? "active" : ""}" data-queue="pending">На обработку (${pendingN})</button>
      <button type="button" class="tab-btn ${queueTab === "done" ? "active" : ""}" data-queue="done">Готово (${doneN})</button>
    </div>

    ${adminBulkDoneRowHtml(null)}

    <div id="admin-items-panel">${renderSeasonItemsPanel(season)}</div>`;

  bindSeasonPanel(el, season);
}

function renderEpisodeItemsPanel(ep) {
  const list = tab === "words" ? ep.words : ep.phrases;
  const visible = list
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.removed)
    .filter(({ item }) => {
      const key = tab === "words" ? normLemma(item.lemma) : normPhrase(item.text);
      const done = tab === "words" ? isWordDone(draft, key) : isPhraseDone(draft, key);
      return queueTab === "done" ? done : !done;
    });

  if (!visible.length) {
    const label = queueTab === "done"
      ? (tab === "words" ? "готовых слов" : "готовых фраз")
      : (tab === "words" ? "слов" : "фраз");
    return `<p class="list-empty">${queueTab === "done" ? `Нет ${label}.` : `Все ${label} обработаны — см. вкладку «Готово».`}</p>`;
  }

  return `
    <div class="admin-items">
      ${visible.map(({ item, idx }) => episodeItemRow(item, idx)).join("")}
    </div>`;
}

function renderSeasonItemsPanel(season) {
  const aggregated = aggregateSeasonKind(draft, sel.si, tab);
  const visible = aggregated.filter((agg) => {
    const done = tab === "words" ? isWordDone(draft, agg.key) : isPhraseDone(draft, agg.key);
    return queueTab === "done" ? done : !done;
  });

  if (!visible.length) {
    const label = queueTab === "done"
      ? (tab === "words" ? "готовых слов" : "готовых фраз")
      : (tab === "words" ? "слов" : "фраз");
    return `<p class="list-empty">${queueTab === "done" ? `Нет ${label}.` : `Все ${label} сезона обработаны.`}</p>`;
  }

  return `
    <div class="admin-items">
      ${visible.map((agg) => seasonItemRow(agg)).join("")}
    </div>`;
}

function episodeItemRow(item, idx) {
  const key = tab === "words" ? item.lemma : item.text;
  const chipId = `${tab}-${sel.si}-${sel.ei}-${idx}`;
  const done = queueTab === "done";
  return `
    <div class="admin-item" data-idx="${idx}">
      <div class="admin-item-head">
        <span class="admin-item-text">${esc(titleCase(key))}</span>
        <span class="import-row-meta">×${item.count || 1}</span>
        ${done
    ? `<button type="button" class="admin-item-undo btn btn-sm outline" data-key="${escAttr(key)}" aria-label="Вернуть">Вернуть</button>`
    : `<button type="button" class="admin-item-done btn btn-sm" data-key="${escAttr(key)}" aria-label="Готово">Готово</button>`}
        <button type="button" class="admin-item-remove" data-idx="${idx}" aria-label="Удалить">×</button>
      </div>
      ${transChipsHtml(item.translations || [], { id: chipId, editable: true })}
    </div>`;
}

function seasonItemRow(agg) {
  const chipId = seasonChipId(tab, sel.si, agg.key);
  const epLabel = agg.episodes.map((n) => `E${String(n).padStart(2, "0")}`).join(", ");
  const done = queueTab === "done";
  return `
    <div class="admin-item" data-key="${escAttr(agg.key)}">
      <div class="admin-item-head">
        <span class="admin-item-text">${esc(titleCase(agg.display))}</span>
        <span class="import-row-meta">×${agg.count}</span>
        ${done
    ? `<button type="button" class="admin-item-undo btn btn-sm outline" data-key="${escAttr(agg.key)}" aria-label="Вернуть">Вернуть</button>`
    : `<button type="button" class="admin-item-done btn btn-sm" data-key="${escAttr(agg.key)}" aria-label="Готово">Готово</button>`}
        <button type="button" class="admin-item-remove" data-key="${escAttr(agg.key)}" aria-label="Удалить">×</button>
      </div>
      <p class="admin-item-eps settings-hint">${agg.episodes.length} серий: ${esc(epLabel)}</p>
      ${transChipsHtml(agg.translations || [], { id: chipId, editable: true })}
    </div>`;
}

function bindEpPanel(el, ep) {
  el.querySelector("#admin-open-season")?.addEventListener("click", () => {
    panelScope = "season";
    queueTab = "pending";
    drawEditor(el);
    focusEpPanel(el);
  });

  bindItemsPanelCommon(el, ep, {
    removeHandler(idx) {
      const list = tab === "words" ? ep.words : ep.phrases;
      const item = list[idx];
      if (!item) return;
      if (tab === "words") removeWordGlobally(draft, item.lemma);
      else removePhraseGlobally(draft, item.text);
    },
    doneHandler(key) {
      if (tab === "words") markWordDone(draft, key);
      else markPhraseDone(draft, key);
    },
    undoHandler(key) {
      if (tab === "words") unmarkWordDone(draft, key);
      else unmarkPhraseDone(draft, key);
    },
    bulkDoneHandler: () => markAllPendingWithTranslationDone(ep),
    bulkSkipHandler: () => skipAllPendingWithoutTranslation(ep),
    translationHandler(id, translations) {
      const parts = id.split("-");
      const kind = parts[0];
      const si = +parts[1];
      const ei = +parts[2];
      const idx = +parts[3];
      const target = draft.seasons[si]?.episodes[ei];
      if (!target) return;
      const list = kind === "words" ? target.words : target.phrases;
      const item = list[idx];
      if (!item) return;
      if (kind === "words") setWordTranslationsGlobally(draft, item.lemma, translations);
      else setPhraseTranslationsGlobally(draft, item.text, translations);
    },
  });

  el.querySelector("#admin-add-btn")?.addEventListener("click", () => {
    const inp = el.querySelector("#admin-add-text");
    const val = inp?.value.trim().toLowerCase();
    if (!val) return;
    const list = tab === "words" ? ep.words : ep.phrases;
    const exists = list.find((x) => !x.removed && (tab === "words" ? x.lemma : x.text) === val);
    if (exists) {
      inp.value = "";
      return;
    }
    if (tab === "words") {
      unreremoveWord(draft, val);
      const curated = getCuratedTranslations(draft, "words", val);
      ep.words.push({
        lemma: val,
        count: 1,
        translations: curated ?? translate(val, _dictCache),
        removed: false,
      });
    } else {
      unreremovePhrase(draft, val);
      const curated = getCuratedTranslations(draft, "phrases", val);
      ep.phrases.push({
        text: val,
        count: 1,
        translations: curated ?? translatePhrase(val, _phrasesCache),
        removed: false,
      });
    }
    inp.value = "";
    persistDraft();
    drawEpPanel(el);
  });

  el.querySelector("#admin-add-text")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.querySelector("#admin-add-btn")?.click();
  });
}

function bindSeasonPanel(el, season) {
  el.querySelector("#admin-back-episode")?.addEventListener("click", () => {
    panelScope = "episode";
    drawEditor(el);
    focusEpPanel(el);
  });

  bindItemsPanelCommon(el, season, {
    removeHandler(_idx, key) {
      if (tab === "words") removeWordGlobally(draft, key);
      else removePhraseGlobally(draft, key);
    },
    doneHandler(key) {
      if (tab === "words") markWordDone(draft, key);
      else markPhraseDone(draft, key);
    },
    undoHandler(key) {
      if (tab === "words") unmarkWordDone(draft, key);
      else unmarkPhraseDone(draft, key);
    },
    bulkDoneHandler: () => markAllPendingWithTranslationDone(null),
    bulkSkipHandler: () => skipAllPendingWithoutTranslation(null),
    translationHandler(id, translations) {
      const parsed = parseSeasonChipId(id);
      if (!parsed) return;
      if (parsed.kind === "words") setWordTranslationsGlobally(draft, parsed.key, translations);
      else setPhraseTranslationsGlobally(draft, parsed.key, translations);
    },
    useKeyForRemove: true,
  });
}

function bindItemsPanelCommon(el, _ctx, handlers) {
  el.querySelectorAll(".admin-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      drawEpPanel(el);
    });
  });

  el.querySelectorAll(".admin-queue-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      queueTab = btn.dataset.queue;
      drawEpPanel(el);
    });
  });

  el.querySelectorAll(".admin-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scrollRoot = adminScrollRoot();
      const scrollTop = readAdminScrollTop(scrollRoot);
      if (handlers.useKeyForRemove) {
        const key = btn.dataset.key;
        if (!key) return;
        handlers.removeHandler(null, key);
      } else {
        handlers.removeHandler(+btn.dataset.idx);
      }
      persistDraft();
      drawEpList(el);
      drawEpPanel(el);
      requestAnimationFrame(() => setAdminScrollTop(scrollRoot, scrollTop));
    });
  });

  el.querySelectorAll(".admin-item-done").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scrollRoot = adminScrollRoot();
      const scrollTop = readAdminScrollTop(scrollRoot);
      const key = btn.dataset.key;
      if (!key) return;
      handlers.doneHandler(key);
      persistDraft();
      drawEpList(el);
      drawEpPanel(el);
      requestAnimationFrame(() => setAdminScrollTop(scrollRoot, scrollTop));
    });
  });

  el.querySelectorAll(".admin-item-undo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scrollRoot = adminScrollRoot();
      const scrollTop = readAdminScrollTop(scrollRoot);
      const key = btn.dataset.key;
      if (!key) return;
      handlers.undoHandler(key);
      persistDraft();
      drawEpList(el);
      drawEpPanel(el);
      requestAnimationFrame(() => setAdminScrollTop(scrollRoot, scrollTop));
    });
  });

  el.querySelector("#admin-done-all-trans")?.addEventListener("click", () => {
    if (!handlers.bulkDoneHandler) return;
    handlers.bulkDoneHandler();
    persistDraft();
    drawEpList(el);
    drawEpPanel(el);
  });

  el.querySelector("#admin-skip-no-trans")?.addEventListener("click", () => {
    if (!handlers.bulkSkipHandler) return;
    const n = countPendingWithoutTranslation(null);
    if (!n) return;
    const label = tab === "words" ? "слов" : "фраз";
    if (!window.confirm(`Пропустить ${n} ${label} без перевода? Они будут удалены из набора.`)) return;
    handlers.bulkSkipHandler();
    persistDraft();
    drawEpList(el);
    drawEpPanel(el);
  });

  bindTransChipsContainers(el.querySelector("#admin-items-panel"), {
    onChange(id, translations) {
      handlers.translationHandler(id, translations);
      persistDraft();
    },
  });
}

// ---------- Zip ingest ----------

let _dictCache = null;
let _phrasesCache = null;

async function ingestZips(target, files) {
  _dictCache = await getDictionary();
  const forms = getFormsIndex();
  _phrasesCache = await getPhrases();
  const blank = emptyState();

  for (const file of files) {
    const entries = filterSrtEntries(await unzipFile(file));
    if (!entries.length) {
      throw new Error(`В ${file.name} нет .srt файлов`);
    }

    let autoEp = 1;
    for (const entry of entries) {
      const baseName = entry.name.split("/").pop();
      const text = parseSrt(entryText(entry));
      if (!text) continue;

      const meta = parseFileName(baseName);
      const seasonNum = meta.season ?? 1;
      let epNum = meta.episode;
      if (epNum == null) {
        epNum = autoEp;
        autoEp++;
      }

      const words = analyzeText(blank, text, _dictCache, forms).map((w) => {
        const curated = getCuratedTranslations(target, "words", w.lemma);
        return {
          lemma: w.lemma,
          count: w.count,
          translations: curated ?? translate(w.lemma, _dictCache),
          removed: ensureCuration(target).removedWords.includes(normLemma(w.lemma)),
        };
      });

      const phrases = analyzePhrases(blank, text, _dictCache, forms, _phrasesCache).map((p) => {
        const curated = getCuratedTranslations(target, "phrases", p.text);
        return {
          text: p.text,
          count: p.count,
          translations: curated ?? translatePhrase(p.text, _phrasesCache),
          removed: ensureCuration(target).removedPhrases.includes(normPhrase(p.text)),
        };
      });

      mergeEpisode(target, seasonNum, epNum, meta.episodeTitle || baseName.replace(/\.srt$/i, ""), words, phrases);
    }
  }
}

function mergeEpisode(d, seasonNum, epNum, title, words, phrases) {
  let season = d.seasons.find((s) => s.number === seasonNum);
  if (!season) {
    season = { number: seasonNum, episodes: [] };
    d.seasons.push(season);
  }

  let ep = season.episodes.find((e) => e.number === epNum);
  if (!ep) {
    ep = { number: epNum, title, words: [], phrases: [] };
    season.episodes.push(ep);
  } else if (title && !ep.title) {
    ep.title = title;
  }

  for (const w of words) {
    const key = normLemma(w.lemma);
    const prev = ep.words.find((x) => normLemma(x.lemma) === key);
    if (prev) {
      prev.count += w.count;
      if (w.removed) prev.removed = true;
      else if (!prev.translations?.length && w.translations?.length) prev.translations = w.translations;
    } else if (!w.removed) {
      ep.words.push({ ...w });
    }
  }

  for (const p of phrases) {
    const key = normPhrase(p.text);
    const prev = ep.phrases.find((x) => normPhrase(x.text) === key);
    if (prev) {
      prev.count += p.count;
      if (p.removed) prev.removed = true;
      else if (!prev.translations?.length && p.translations?.length) prev.translations = p.translations;
    } else if (!p.removed) {
      ep.phrases.push({ ...p });
    }
  }

  for (const w of ep.words) applyCurationToWord(d, w);
  for (const p of ep.phrases) applyCurationToPhrase(d, p);
}

// ---------- Export ----------

function buildShowJson(d) {
  const wordTrans = {};
  const phraseTrans = {};

  const seasons = d.seasons
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((season) => ({
      number: season.number,
      episodes: season.episodes
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((ep) => {
          const words = [];
          const phrases = [];
          for (const w of ep.words) {
            if (w.removed) continue;
            words.push(w.lemma);
            const t = (w.translations || []).filter(Boolean).slice(0, 3);
            if (t.length) wordTrans[w.lemma] = t;
          }
          for (const p of ep.phrases) {
            if (p.removed) continue;
            phrases.push(p.text);
            const t = (p.translations || []).filter(Boolean).slice(0, 3);
            if (t.length) phraseTrans[p.text] = t;
          }
          return { number: ep.number, title: ep.title || "", words, phrases };
        })
        .filter((ep) => ep.words.length || ep.phrases.length),
    }))
    .filter((s) => s.episodes.length);

  return {
    id: d.showId,
    title: d.showTitle,
    seasons,
    translations: { words: wordTrans, phrases: phraseTrans },
  };
}

async function mergeIndexJson(d) {
  let index = { shows: [] };
  try {
    const res = await fetch("./data/library/index.json");
    if (res.ok) index = await res.json();
  } catch {
    /* первый экспорт — пустой index */
  }

  let seasons = 0;
  let episodes = 0;
  for (const s of d.seasons) {
    seasons++;
    episodes += s.episodes.filter((ep) =>
      ep.words.some((w) => !w.removed) || ep.phrases.some((p) => !p.removed)
    ).length;
  }

  const entry = {
    id: d.showId,
    title: d.showTitle,
    file: `${d.showId}.json`,
    seasons,
    episodes,
  };

  index.shows = (index.shows || []).filter((s) => s.id !== d.showId);
  index.shows.push(entry);
  index.shows.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  return index;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Draft persistence ----------

function emptyDraft(showId, showTitle) {
  return { showId, showTitle, seasons: [], curation: emptyCuration() };
}

function emptyCuration() {
  return {
    removedWords: [],
    removedPhrases: [],
    wordTranslations: {},
    phraseTranslations: {},
    doneWords: [],
    donePhrases: [],
  };
}

function ensureCuration(d) {
  if (!d.curation) d.curation = emptyCuration();
  const c = d.curation;
  if (!Array.isArray(c.doneWords)) c.doneWords = [];
  if (!Array.isArray(c.donePhrases)) c.donePhrases = [];
  return c;
}

function normLemma(lemma) {
  return String(lemma).trim().toLowerCase();
}

function normPhrase(text) {
  return String(text).trim().toLowerCase();
}

function syncCurationRemovedFromEpisodes(d) {
  const c = ensureCuration(d);
  const removedWords = new Set(c.removedWords.map(normLemma));
  const removedPhrases = new Set(c.removedPhrases.map(normPhrase));

  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      for (const w of ep.words) {
        if (w.removed) removedWords.add(normLemma(w.lemma));
      }
      for (const p of ep.phrases) {
        if (p.removed) removedPhrases.add(normPhrase(p.text));
      }
    }
  }

  c.removedWords = [...removedWords];
  c.removedPhrases = [...removedPhrases];
}

function getCuratedTranslations(d, kind, key) {
  const c = ensureCuration(d);
  const map = kind === "words" ? c.wordTranslations : c.phraseTranslations;
  const norm = kind === "words" ? normLemma(key) : normPhrase(key);
  const t = map[norm];
  return Array.isArray(t) ? t.filter(Boolean).slice(0, 3) : null;
}

function applyCurationToWord(d, w) {
  if (ensureCuration(d).removedWords.includes(normLemma(w.lemma))) {
    w.removed = true;
  }
  const curated = getCuratedTranslations(d, "words", w.lemma);
  if (curated !== null) w.translations = curated;
}

function applyCurationToPhrase(d, p) {
  if (ensureCuration(d).removedPhrases.includes(normPhrase(p.text))) {
    p.removed = true;
  }
  const curated = getCuratedTranslations(d, "phrases", p.text);
  if (curated !== null) p.translations = curated;
}

function reapplyCuration(d) {
  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      ep.words.forEach((w) => applyCurationToWord(d, w));
      ep.phrases.forEach((p) => applyCurationToPhrase(d, p));
    }
  }
}

function migrateDraft(d) {
  if (!d?.seasons?.length) return d;
  syncCurationRemovedFromEpisodes(d);
  reapplyCuration(d);
  return d;
}

function removeWordGlobally(d, lemma) {
  const key = normLemma(lemma);
  const c = ensureCuration(d);
  if (!c.removedWords.includes(key)) c.removedWords.push(key);
  c.doneWords = c.doneWords.filter((k) => k !== key);
  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      for (const w of ep.words) {
        if (normLemma(w.lemma) === key) w.removed = true;
      }
    }
  }
}

function removePhraseGlobally(d, text) {
  const key = normPhrase(text);
  const c = ensureCuration(d);
  if (!c.removedPhrases.includes(key)) c.removedPhrases.push(key);
  c.donePhrases = c.donePhrases.filter((k) => k !== key);
  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      for (const p of ep.phrases) {
        if (normPhrase(p.text) === key) p.removed = true;
      }
    }
  }
}

function unreremoveWord(d, lemma) {
  const key = normLemma(lemma);
  ensureCuration(d).removedWords = ensureCuration(d).removedWords.filter((k) => k !== key);
}

function unreremovePhrase(d, text) {
  const key = normPhrase(text);
  ensureCuration(d).removedPhrases = ensureCuration(d).removedPhrases.filter((k) => k !== key);
}

function setWordTranslationsGlobally(d, lemma, translations) {
  const key = normLemma(lemma);
  const t = translations.filter(Boolean).slice(0, 3);
  ensureCuration(d).wordTranslations[key] = t;
  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      for (const w of ep.words) {
        if (normLemma(w.lemma) === key) w.translations = [...t];
      }
    }
  }
}

function setPhraseTranslationsGlobally(d, text, translations) {
  const key = normPhrase(text);
  const t = translations.filter(Boolean).slice(0, 3);
  ensureCuration(d).phraseTranslations[key] = t;
  for (const season of d.seasons) {
    for (const ep of season.episodes) {
      for (const p of ep.phrases) {
        if (normPhrase(p.text) === key) p.translations = [...t];
      }
    }
  }
}

function isWordDone(d, lemma) {
  return ensureCuration(d).doneWords.includes(normLemma(lemma));
}

function isPhraseDone(d, text) {
  return ensureCuration(d).donePhrases.includes(normPhrase(text));
}

function markWordDone(d, lemma) {
  const key = normLemma(lemma);
  const c = ensureCuration(d);
  if (!c.doneWords.includes(key)) c.doneWords.push(key);
}

function markPhraseDone(d, text) {
  const key = normPhrase(text);
  const c = ensureCuration(d);
  if (!c.donePhrases.includes(key)) c.donePhrases.push(key);
}

function unmarkWordDone(d, lemma) {
  const key = normLemma(lemma);
  ensureCuration(d).doneWords = ensureCuration(d).doneWords.filter((k) => k !== key);
}

function unmarkPhraseDone(d, text) {
  const key = normPhrase(text);
  ensureCuration(d).donePhrases = ensureCuration(d).donePhrases.filter((k) => k !== key);
}

function aggregateSeasonKind(d, si, kind) {
  const season = d.seasons[si];
  if (!season) return [];
  const map = new Map();

  for (const ep of season.episodes) {
    const list = kind === "words" ? ep.words : ep.phrases;
    for (const item of list) {
      if (item.removed) continue;
      const key = kind === "words" ? normLemma(item.lemma) : normPhrase(item.text);
      let agg = map.get(key);
      if (!agg) {
        const curated = getCuratedTranslations(d, kind, key);
        agg = {
          key,
          display: kind === "words" ? item.lemma : item.text,
          count: 0,
          translations: curated ?? (item.translations || []).filter(Boolean).slice(0, 3),
          episodes: [],
        };
        map.set(key, agg);
      }
      agg.count += item.count || 1;
      if (!agg.episodes.includes(ep.number)) agg.episodes.push(ep.number);
    }
  }

  for (const agg of map.values()) {
    agg.episodes.sort((a, b) => a - b);
    const curated = getCuratedTranslations(d, kind, agg.key);
    if (curated !== null) agg.translations = curated;
  }

  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function countEpisodePending(ep, kind) {
  const list = kind === "words" ? ep.words : ep.phrases;
  return list.filter((item) => {
    if (item.removed) return false;
    const key = kind === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    return kind === "words" ? !isWordDone(draft, key) : !isPhraseDone(draft, key);
  }).length;
}

function countEpisodeDone(ep, kind) {
  const list = kind === "words" ? ep.words : ep.phrases;
  return list.filter((item) => {
    if (item.removed) return false;
    const key = kind === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    return kind === "words" ? isWordDone(draft, key) : isPhraseDone(draft, key);
  }).length;
}

function countSeasonPending(si, kind) {
  return aggregateSeasonKind(draft, si, kind).filter((agg) =>
    kind === "words" ? !isWordDone(draft, agg.key) : !isPhraseDone(draft, agg.key)
  ).length;
}

function countSeasonDone(si, kind) {
  return aggregateSeasonKind(draft, si, kind).filter((agg) =>
    kind === "words" ? isWordDone(draft, agg.key) : isPhraseDone(draft, agg.key)
  ).length;
}

function hasCuratedTranslations(item) {
  return (item.translations || []).some(Boolean);
}

function isCuratedItemDone(key) {
  return tab === "words" ? isWordDone(draft, key) : isPhraseDone(draft, key);
}

function countPendingWithTranslation(ep) {
  if (panelScope === "season") {
    return aggregateSeasonKind(draft, sel.si, tab).filter((agg) =>
      !isCuratedItemDone(agg.key) && hasCuratedTranslations(agg)
    ).length;
  }
  const list = tab === "words" ? ep.words : ep.phrases;
  return list.filter((item) => {
    if (item.removed) return false;
    const key = tab === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    return !isCuratedItemDone(key) && hasCuratedTranslations(item);
  }).length;
}

function markAllPendingWithTranslationDone(ep) {
  if (panelScope === "season") {
    for (const agg of aggregateSeasonKind(draft, sel.si, tab)) {
      if (isCuratedItemDone(agg.key) || !hasCuratedTranslations(agg)) continue;
      if (tab === "words") markWordDone(draft, agg.key);
      else markPhraseDone(draft, agg.key);
    }
    return;
  }
  const list = tab === "words" ? ep.words : ep.phrases;
  for (const item of list) {
    if (item.removed) continue;
    const key = tab === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    if (isCuratedItemDone(key) || !hasCuratedTranslations(item)) continue;
    if (tab === "words") markWordDone(draft, item.lemma);
    else markPhraseDone(draft, item.text);
  }
}

function countPendingWithoutTranslation(ep) {
  if (panelScope === "season") {
    return aggregateSeasonKind(draft, sel.si, tab).filter((agg) =>
      !isCuratedItemDone(agg.key) && !hasCuratedTranslations(agg)
    ).length;
  }
  const list = tab === "words" ? ep.words : ep.phrases;
  return list.filter((item) => {
    if (item.removed) return false;
    const key = tab === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    return !isCuratedItemDone(key) && !hasCuratedTranslations(item);
  }).length;
}

function skipAllPendingWithoutTranslation(ep) {
  if (panelScope === "season") {
    for (const agg of aggregateSeasonKind(draft, sel.si, tab)) {
      if (isCuratedItemDone(agg.key) || hasCuratedTranslations(agg)) continue;
      if (tab === "words") removeWordGlobally(draft, agg.key);
      else removePhraseGlobally(draft, agg.display || agg.key);
    }
    return;
  }
  const list = tab === "words" ? ep.words : ep.phrases;
  for (const item of list) {
    if (item.removed) continue;
    const key = tab === "words" ? normLemma(item.lemma) : normPhrase(item.text);
    if (isCuratedItemDone(key) || hasCuratedTranslations(item)) continue;
    if (tab === "words") removeWordGlobally(draft, item.lemma);
    else removePhraseGlobally(draft, item.text);
  }
}

function adminBulkDoneRowHtml(ep) {
  if (queueTab !== "pending") return "";
  const withTrans = countPendingWithTranslation(ep);
  const noTrans = countPendingWithoutTranslation(ep);
  return `
    <div class="admin-bulk-done-row">
      <button type="button" class="btn btn-sm" id="admin-done-all-trans" ${withTrans ? "" : "disabled"}>
        Готово для всех с переводом (${withTrans})
      </button>
      <button type="button" class="btn btn-sm outline admin-skip-no-trans" id="admin-skip-no-trans" ${noTrans ? "" : "disabled"}>
        Пропустить все без перевода (${noTrans})
      </button>
    </div>`;
}

function seasonChipId(kind, si, key) {
  const prefix = kind === "words" ? "sw" : "sp";
  return `${prefix}-${si}-${encodeURIComponent(key)}`;
}

function parseSeasonChipId(id) {
  const m = id.match(/^(sw|sp)-(\d+)-(.+)$/);
  if (!m) return null;
  return {
    kind: m[1] === "sw" ? "words" : "phrases",
    si: +m[2],
    key: decodeURIComponent(m[3]),
  };
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? migrateDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persistDraft() {
  if (!draft) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

// ---------- Helpers ----------

function currentEpisode() {
  return draft?.seasons[sel.si]?.episodes[sel.ei] ?? null;
}

function clampSelection() {
  if (!draft?.seasons?.length) {
    sel = { si: 0, ei: 0 };
    return;
  }
  if (!draft.seasons[sel.si]) sel.si = 0;
  if (!draft.seasons[sel.si]?.episodes[sel.ei]) sel.ei = 0;
}

function sortDraft(d) {
  d.seasons.sort((a, b) => a.number - b.number);
  for (const s of d.seasons) {
    s.episodes.sort((a, b) => a.number - b.number);
  }
}

function countEpisodes(d) {
  return d.seasons.reduce((n, s) => n + s.episodes.length, 0);
}

function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "show";
}

function inferShowTitle(name) {
  return String(name || "").replace(/\.zip$/i, "").replace(/[._-]+/g, " ").trim() || "Show";
}

function setStatus(el, text, isErr, statusEl) {
  const node = statusEl || el.querySelector("#admin-status");
  if (!node) return;
  node.hidden = false;
  node.textContent = text;
  node.className = `settings-msg ${isErr ? "settings-msg-err" : "settings-msg-ok"}`;
}

function flash(el, text, isErr = false) {
  statusMsg = text;
  statusErr = isErr;
  const node = el.querySelector("#admin-status");
  if (node) setStatus(el, text, isErr, node);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function adminScrollRoot() {
  return document.querySelector(".content") || document.scrollingElement || document.documentElement;
}

function readAdminScrollTop(root) {
  if (root === document.documentElement || root === document.body) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return root.scrollTop || 0;
}

function setAdminScrollTop(root, top) {
  if (root === document.documentElement || root === document.body) {
    window.scrollTo(0, top);
    return;
  }
  root.scrollTop = top;
}
