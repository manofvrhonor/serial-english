// ===== Ленивая загрузка офлайн-базы выражений EN→RU =====

import { SUGGEST_TRANS_LIMIT } from "./dictionary.js";

let _phrases = null;
let _loading = null;

const PHRASES_JSON = "./data/phrases.json";

async function fetchPhrases() {
  const res = await fetch(PHRASES_JSON);
  if (!res.ok) throw new Error(`Не удалось загрузить (${PHRASES_JSON})`);
  return res.json();
}

export async function getPhrases() {
  if (_phrases) return _phrases;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      _phrases = await fetchPhrases();
    } catch {
      console.warn("База выражений не загружена");
      _phrases = {};
    }
    _loading = null;
    return _phrases;
  })();

  return _loading;
}

export function translatePhrase(text, phrases) {
  if (!phrases || !text) return [];
  const key = String(text).toLowerCase().trim();
  return Array.isArray(phrases[key]) ? phrases[key].slice(0, SUGGEST_TRANS_LIMIT) : [];
}
