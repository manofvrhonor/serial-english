import {
  findWordById,
  findPhraseById,
  updateWord,
  updatePhrase,
  markWordLearned,
  markPhraseLearned,
  deleteWord,
} from "../db/database.js";
import { transChipsHtml, bindTransChipsContainers } from "./trans-chips.js?v=20260621";

let modalReady = false;
let chipsRoot = null;

function ensureModal() {
  if (modalReady) return document.getElementById("train-edit-modal");

  const modal = document.createElement("div");
  modal.id = "train-edit-modal";
  modal.className = "modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-backdrop" id="train-edit-backdrop"></div>
    <div class="modal-card card card-padded" role="dialog" aria-labelledby="train-edit-title">
      <h2 class="settings-heading" id="train-edit-title">Исправить</h2>
      <p class="train-edit-lemma" id="train-edit-lemma"></p>
      <div id="train-edit-chips"></div>
      <div class="modal-actions train-edit-actions">
        <button type="button" class="btn btn-danger" id="train-edit-stop" hidden>В стоп-лист</button>
        <button type="button" class="btn" id="train-edit-learned">Выучено</button>
        <button type="button" class="btn secondary" id="train-edit-close">Закрыть</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector("#train-edit-backdrop")?.addEventListener("click", () => closeModal());
  modal.querySelector("#train-edit-close")?.addEventListener("click", () => closeModal());

  chipsRoot = modal.querySelector("#train-edit-chips");
  bindTransChipsContainers(chipsRoot, {
    onChange(_id, translations) {
      if (!activeCtx || !activeItem) return;
      if (activeKind === "word") updateWord(activeCtx.state, activeItem.id, { translations });
      else updatePhrase(activeCtx.state, activeItem.id, { translations });
      activeCtx.save();
      activeItem.translations = translations;
    },
  });

  modalReady = true;
  return modal;
}

let activeCtx = null;
let activeKind = null;
let activeItem = null;
let onCloseCb = null;
let onRemovedCb = null;

function closeModal() {
  const modal = document.getElementById("train-edit-modal");
  if (modal) modal.hidden = true;
  activeCtx = null;
  activeItem = null;
  onCloseCb = null;
  onRemovedCb = null;
}

/**
 * @param {object} ctx
 * @param {{ kind: 'word'|'phrase', itemId: string, onClose?: () => void, onRemoved?: () => void }} opts
 */
export function openTrainEditModal(ctx, { kind, itemId, onClose, onRemoved }) {
  const modal = ensureModal();
  const item = kind === "word" ? findWordById(ctx.state, itemId) : findPhraseById(ctx.state, itemId);
  if (!item) return;

  activeCtx = ctx;
  activeKind = kind;
  activeItem = item;
  onCloseCb = onClose;
  onRemovedCb = onRemoved;

  const label = kind === "word" ? item.lemma : item.text;
  modal.querySelector("#train-edit-title").textContent = kind === "word"
    ? "Исправить слово"
    : "Исправить выражение";
  modal.querySelector("#train-edit-lemma").textContent = label;
  modal.querySelector("#train-edit-stop").hidden = kind !== "word";

  chipsRoot.innerHTML = transChipsHtml(item.translations || [], {
    id: `train-edit-${item.id}`,
    editable: true,
  });

  modal.hidden = false;

  const finishRemoved = () => {
    const cb = onRemovedCb;
    closeModal();
    cb?.();
  };

  modal.querySelector("#train-edit-learned").onclick = () => {
    if (kind === "word") markWordLearned(ctx.state, itemId);
    else markPhraseLearned(ctx.state, itemId);
    ctx.save();
    finishRemoved();
  };

  modal.querySelector("#train-edit-stop").onclick = () => {
    if (kind !== "word") return;
    deleteWord(ctx.state, itemId);
    ctx.save();
    finishRemoved();
  };
}

export function closeTrainEditModal() {
  const cb = onCloseCb;
  closeModal();
  cb?.();
}
