const MAX_TRANS = 3;

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
      <span class="trans-chip-text">${esc(t)}</span>
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
export function bindTransChipsContainers(root, { onChange }) {
  root.querySelectorAll(".trans-chips[data-editable='1']").forEach((container) => {
    bindOne(container, onChange);
  });
}

function bindOne(container, onChange) {
  const id = container.dataset.chipsId;
  let dragFrom = null;

  const emit = (list) => {
    const next = list.filter(Boolean).slice(0, MAX_TRANS);
    onChange(id, next);
  };

  container.querySelectorAll(".trans-chip-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const chip = btn.closest(".trans-chip");
      const idx = +chip.dataset.idx;
      const list = readChips(container);
      list.splice(idx, 1);
      const next = renderChips(container, list);
      bindOne(next, onChange);
      emit(list);
    });
  });

  container.querySelectorAll(".trans-chip[draggable='true']").forEach((chip) => {
    chip.addEventListener("dragstart", (e) => {
      dragFrom = +chip.dataset.idx;
      chip.classList.add("trans-chip-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragend", () => {
      chip.classList.remove("trans-chip-dragging");
      dragFrom = null;
    });
    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = +chip.dataset.idx;
      if (dragFrom === null || dragFrom === to) return;
      const list = readChips(container);
      const [moved] = list.splice(dragFrom, 1);
      list.splice(to, 0, moved);
      const next = renderChips(container, list);
      bindOne(next, onChange);
      emit(list);
    });
  });

  container.querySelector(".trans-chip-add")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    const list = readChips(container);
    if (list.length >= MAX_TRANS) return;
    list.push(val);
    e.target.value = "";
    const next = renderChips(container, list);
    bindOne(next, onChange);
    emit(list);
  });
}

export { MAX_TRANS };
