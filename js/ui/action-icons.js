/** Единые SVG-иконки и разметка кнопок действий по всему приложению. */

export const ICON_CHECK = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export const ICON_X = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

export const ICON_TRASH = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

export const ICON_BAN = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`;

export const ICON_RETURN = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;

export const ICON_SOURCES = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg>`;

const BTN = "btn outline btn-sm btn-icon-only";

/** ✓ Выучено / Знаю */
export function btnLearned(attrs, { title = "Выучено", extraClass = "" } = {}) {
  const cls = extraClass ? `${BTN} ${extraClass}` : BTN;
  return `<button type="button" class="${cls}" ${attrs} title="${title}" aria-label="${title}">${ICON_CHECK}</button>`;
}

/** 🚫 В стоп-лист */
export function btnStopList(attrs, { title = "В стоп-лист" } = {}) {
  return `<button type="button" class="${BTN} btn-icon-danger row-btn-stop" ${attrs} title="${title}" aria-label="${title}">${ICON_BAN}</button>`;
}

/** 🗑 Удалить */
export function btnDeleteWord(attrs, { title = "Удалить слово" } = {}) {
  return `<button type="button" class="${BTN} btn-icon-danger" ${attrs} title="${title}" aria-label="${title}">${ICON_TRASH}</button>`;
}

/** ✕ Убрать / исключить (не полное удаление) */
export function btnRemove(attrs, { title = "Убрать" } = {}) {
  return `<button type="button" class="${BTN} btn-icon-danger" ${attrs} title="${title}" aria-label="${title}">${ICON_X}</button>`;
}

/** ↩ Вернуть в изучение */
export function btnReturnStudy(attrs, { title = "Вернуть в изучение" } = {}) {
  return `<button type="button" class="${BTN}" ${attrs} title="${title}" aria-label="${title}">${ICON_RETURN}</button>`;
}

/** ≡ Источники */
export function btnSources(attrs, title, disabled = false) {
  return `<button type="button" class="${BTN}" ${attrs} title="${title}" aria-label="${title}"${disabled ? " disabled" : ""}>${ICON_SOURCES}</button>`;
}
