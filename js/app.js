import { loadState, saveState } from "./db/database.js";
import { initRouter } from "./router.js";

// Глобальный контекст приложения — живёт в памяти всё время работы
const ctx = {
  state: null,
  save: null,
  trainingPrep: null,
};

async function start() {
  // Загружаем состояние один раз и держим в памяти
  ctx.state = await loadState();

  // Функция сохранения текущего состояния в БД
  ctx.save = () => saveState(ctx.state);
  ctx.reload = async () => { ctx.state = await loadState(); };

  // Передаём контекст в роутер (он раздаст его во view)
  initRouter(ctx);

  console.log("Serial English: каркас запущен ✔");
}

start();