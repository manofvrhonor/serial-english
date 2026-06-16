/** @deprecated Раздел перенесён в «База знаний». Re-export для совместимости. */
export { mountPhrasesPanel } from "./study-phrases.js";

export function renderPhrases(el, ctx) {
  el.innerHTML = `
    <div class="page">
      <p class="view-subtitle">Раздел «Выражения» перенесён в <b>База знаний → На изучении</b>.</p>
    </div>`;
}
