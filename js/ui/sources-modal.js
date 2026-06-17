import { formatSourceShort } from "../db/database.js";

let modalReady = false;

function ensureModal() {
  if (modalReady) return document.getElementById("sources-modal");

  const modal = document.createElement("div");
  modal.id = "sources-modal";
  modal.className = "modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-backdrop" id="sources-modal-backdrop"></div>
    <div class="modal-card card card-padded" role="dialog" aria-labelledby="sources-modal-title">
      <h2 class="settings-heading" id="sources-modal-title">Источники</h2>
      <ul class="sources-modal-list" id="sources-modal-list"></ul>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="sources-modal-close">Закрыть</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { modal.hidden = true; };
  modal.querySelector("#sources-modal-backdrop")?.addEventListener("click", close);
  modal.querySelector("#sources-modal-close")?.addEventListener("click", close);

  modalReady = true;
  return modal;
}

export function openSourcesModal(state, sourceIds, itemLabel = "", { manual = false } = {}) {
  const modal = ensureModal();
  const ids = (sourceIds || []).filter(Boolean);
  const labels = ids.map((id) => formatSourceShort(state, id)).filter(Boolean);

  modal.querySelector("#sources-modal-title").textContent = itemLabel
    ? `Источники — ${itemLabel}`
    : "Источники";

  const list = modal.querySelector("#sources-modal-list");
  if (manual && !labels.length) {
    list.innerHTML = `<li class="sources-modal-empty">Добавлено вручную</li>`;
  } else if (labels.length) {
    list.innerHTML = labels.map((l) => `<li>${esc(l)}</li>`).join("");
  } else {
    list.innerHTML = `<li class="sources-modal-empty">Нет источников</li>`;
  }

  modal.hidden = false;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
