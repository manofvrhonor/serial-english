import { titleCase } from "../core/display-text.js";

const MAX_TRANS = 3;

const rootHandlers = new WeakMap();
const boundRoots = new WeakSet();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** HTML блока переводов-чипов (до 3 шт.) */
export function transChipsHtml(translations, { id, editable = true, max = MAX_TRANS } = {}) {
  const list = (translations || []).filter(Boolean).slice(0, max);
  const chips = list.map((t, idx) => `
    <span class="trans-chip" draggable="${editable ? "true" : "false"}" data-idx="${idx}" title="Перетащите для смены порядка">
      <span class="trans-chip-text">${esc(titleCase(t))}</span>
      ${editable ? `<button type="button" class="trans-chip-remove" aria-label="Удалить перевод">×</button>` : ""}
    </span>`).join("");

  const addField = editable && list.length < max
    ? `<input type="text" class="trans-chip-add" placeholder="+ перевод" maxlength="80" />`
    : "";

  return `
    <div class="trans-chips" data-chips-id="${esc(id)}" data-editable="${editable ? "1" : "0"}">
      ${chips || (editable ? "" : `<span class="trans-empty">—</span>`)}
      ${addField}
    </div>`;
}

function readChips(container) {
  return [...container.querySelectorAll(".trans-chip-text")].map((el) => el.textContent.trim()).filter(Boolean);
}

function renderChips(container, translations) {
  const id = container.dataset.chipsId;
  const editable = container.dataset.editable === "1";
  const tmp = document.createElement("div");
  tmp.innerHTML = transChipsHtml(translations, { id, editable });
  const fresh = tmp.firstElementChild;
  container.replaceWith(fresh);
  return fresh;
}

/**
 * @param {ParentNode} root
 * @param {{ onChange: (id: string, translations: string[]) => void }} handlers
 */
export function bindTransChipsContainers(root, handlers) {
  rootHandlers.set(root, handlers);
  if (boundRoots.has(root)) return;
  boundRoots.add(root);
  bindDelegated(root);
}

function bindDelegated(root) {
  let dragFrom = null;
  let dragContainer = null;

  const emit = (container, list) => {
    const handlers = rootHandlers.get(root);
    if (!handlers) return;
    const next = list.filter(Boolean).slice(0, MAX_TRANS);
    handlers.onChange(container.dataset.chipsId, next);
  };

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".trans-chip-remove");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();

    const container = btn.closest(".trans-chips");
    if (!container || container.dataset.editable !== "1") return;

    const chip = btn.closest(".trans-chip");
    const idx = +chip.dataset.idx;
    const list = readChips(container);
    list.splice(idx, 1);
    emit(renderChips(container, list), list);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.target.closest(".trans-chip-add");
    if (!input || !root.contains(input)) return;
    e.preventDefault();

    const container = input.closest(".trans-chips");
    if (!container || container.dataset.editable !== "1") return;

    const val = input.value.trim();
    if (!val) return;
    const list = readChips(container);
    if (list.length >= MAX_TRANS) return;
    list.push(val);
    input.value = "";
    emit(renderChips(container, list), list);
  });

  root.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".trans-chip[draggable='true']");
    if (!chip || !root.contains(chip)) return;
    dragFrom = +chip.dataset.idx;
    dragContainer = chip.closest(".trans-chips");
    chip.classList.add("trans-chip-dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  root.addEventListener("dragend", (e) => {
    const chip = e.target.closest(".trans-chip");
    if (chip) chip.classList.remove("trans-chip-dragging");
    dragFrom = null;
    dragContainer = null;
  });

  root.addEventListener("dragover", (e) => {
    const chip = e.target.closest(".trans-chip[draggable='true']");
    if (!chip || !root.contains(chip)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  root.addEventListener("drop", (e) => {
    const chip = e.target.closest(".trans-chip[draggable='true']");
    if (!chip || !root.contains(chip)) return;
    e.preventDefault();

    const container = chip.closest(".trans-chips");
    if (!container || container !== dragContainer || dragFrom === null) return;

    const to = +chip.dataset.idx;
    if (dragFrom === to) return;

    const list = readChips(container);
    const [moved] = list.splice(dragFrom, 1);
    list.splice(to, 0, moved);
    emit(renderChips(container, list), list);
    dragFrom = null;
    dragContainer = null;
  });
}

export { MAX_TRANS };
