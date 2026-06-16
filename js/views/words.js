/** @deprecated Раздел перенесён в «База знаний». Re-export для совместимости. */
export { mountWordsPanel } from "./study-words.js";

export function renderWords(el, ctx) {
  el.innerHTML = `
    <div class="page">
      <p class="view-subtitle">Раздел «Слова» перенесён в <b>База знаний → На изучении</b>.</p>
    </div>`;
}
