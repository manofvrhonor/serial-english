// ===== Синхронизация прогресса IndexedDB <-> сервер =====
// Состояние приложения целиком (объект state) обменивается с сервером одним JSON.
// Стратегия: явные кнопки «Выгрузить»/«Загрузить» + умная «Синхронизировать»
// (last-write-wins по серверному updated_at и метке последней синхронизации).

import { loadState, saveState, normalizeState } from "../db/database.js";
import * as api from "../api/client.js";
import { getSyncedAt, setSyncedAt } from "../api/config.js";

// Выгрузить локальные данные на сервер (локальное состояние становится источником).
export async function pushToServer() {
  const local = await loadState();
  const updatedAt = new Date().toISOString();
  const saved = await api.putProgress(local, updatedAt);
  setSyncedAt(saved?.updated_at || updatedAt);
  return { action: "pushed", updatedAt: saved?.updated_at || updatedAt };
}

// Загрузить данные с сервера в локальную БД (перезаписывает локальные).
export async function pullFromServer(ctx) {
  const server = await api.getProgress();
  if (!server) return { action: "empty" };

  const incoming = normalizeState(server.data || {});
  await saveState(incoming);
  if (ctx?.reload) await ctx.reload();
  setSyncedAt(server.updated_at);
  return { action: "pulled", updatedAt: server.updated_at };
}

// Умная синхронизация: решает направление сама.
export async function smartSync(ctx) {
  const server = await api.getProgress();

  // На сервере пусто — впервые выгружаем локальные данные.
  if (!server) {
    return pushToServer();
  }

  const lastSync = getSyncedAt();

  // Сервер не менялся с нашей прошлой синхронизации — значит свежее локальное → выгружаем.
  if (lastSync && server.updated_at === lastSync) {
    return pushToServer();
  }

  // Сервер изменился (другое устройство) либо мы ещё ни разу не синхронизировались — забираем серверное.
  return pullFromServer(ctx);
}
