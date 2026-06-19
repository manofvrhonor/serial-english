import { loadState, saveState } from "./db/database.js?v=20260721";
import { initRouter } from "./router.js?v=20260721";

// Глобальный контекст приложения — живёт в памяти всё время работы
const ctx = {
  state: null,
  save: null,
  trainingPrep: null,
};

async function start() {
  try {
    ctx.state = await loadState();
    ctx.save = () => saveState(ctx.state);
    ctx.reload = async () => { ctx.state = await loadState(); };
    initRouter(ctx);
    console.log("Serial English: каркас запущен ✔");
  } catch (err) {
    console.error("Serial English: ошибка запуска", err);
    const root = document.getElementById("content");
    if (root) {
      root.innerHTML = `
        <div class="page">
          <h1 class="view-title">Ошибка запуска</h1>
          <p class="settings-msg settings-msg-err">${String(err?.message || err)}</p>
          <p class="view-subtitle">Попробуйте обновить страницу (Ctrl+Shift+R).</p>
        </div>`;
    }
  }
}

start();