// ===== Ленивая загрузка библиотеки сериалов (data/library/) =====

import {
  findOrCreateShow,
  findOrCreateSeason,
  findOrCreateEpisode,
  findWordByLemma,
  findPhraseByText,
  isKnownLemma,
  isKnownPhrase,
  isStopWord,
  addWords,
  addPhrases,
  addSourceToItem,
  setSourceVocabulary,
} from "../db/database.js";
import { translate } from "./dictionary.js";
import { translatePhrase } from "./phrases.js";
import { isServerLibraryEnabled } from "../api/config.js";
import { serverLibraryIndex, serverLibraryShow } from "../api/client.js";

const INDEX_URL = "./data/library/index.json";

let _index = null;
let _indexLoading = null;
const _showCache = new Map();
const _showLoading = new Map();

function normLemma(lemma) {
  return String(lemma).trim().toLowerCase();
}

function normPhrase(text) {
  return String(text).trim().toLowerCase();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить (${url})`);
  return res.json();
}

function normalizeShow(data) {
  if (!data || typeof data !== "object") return null;
  return {
    id: String(data.id || "").trim(),
    title: String(data.title || data.id || "").trim(),
    seasons: Array.isArray(data.seasons) ? data.seasons : [],
    translations: {
      words: data.translations?.words && typeof data.translations.words === "object"
        ? data.translations.words
        : {},
      phrases: data.translations?.phrases && typeof data.translations.phrases === "object"
        ? data.translations.phrases
        : {},
    },
  };
}

export function episodeKey(season, episode) {
  return `${Number(season)}-${Number(episode)}`;
}

export function parseEpisodeKey(key) {
  const [season, episode] = String(key).split("-").map(Number);
  return { season, episode };
}

export async function getLibraryIndex() {
  if (_index) return _index;
  if (_indexLoading) return _indexLoading;

  _indexLoading = (async () => {
    try {
      let data;
      if (isServerLibraryEnabled()) {
        try {
          data = await serverLibraryIndex();
        } catch (e) {
          console.warn("Серверная библиотека недоступна — локальный индекс", e);
          data = await fetchJson(INDEX_URL);
        }
      } else {
        data = await fetchJson(INDEX_URL);
      }
      _index = {
        shows: Array.isArray(data?.shows)
          ? data.shows.map((s) => ({
            id: String(s.id || "").trim(),
            title: String(s.title || s.id || "").trim(),
            file: String(s.file || `${s.id}.json`).trim(),
            seasons: Number(s.seasons) || 0,
            episodes: Number(s.episodes) || 0,
          })).filter((s) => s.id)
          : [],
        loadError: null,
      };
    } catch (err) {
      console.warn("Индекс библиотеки не загружен", err);
      _index = {
        shows: [],
        loadError: err?.message || String(err),
      };
    }
    _indexLoading = null;
    return _index;
  })();

  return _indexLoading;
}

export async function getLibraryShow(showId) {
  const id = String(showId || "").trim();
  if (!id) return null;
  if (_showCache.has(id)) return _showCache.get(id);

  let pending = _showLoading.get(id);
  if (!pending) {
    pending = (async () => {
      const index = await getLibraryIndex();
      const entry = index.shows.find((s) => s.id === id);
      const file = entry?.file || `${id}.json`;
      try {
        let raw;
        if (isServerLibraryEnabled()) {
          try {
            raw = await serverLibraryShow(id);
          } catch (e) {
            console.warn(`Серверный сериал недоступен — локальный файл: ${id}`, e);
            raw = await fetchJson(`./data/library/${file}`);
          }
        } else {
          raw = await fetchJson(`./data/library/${file}`);
        }
        const data = normalizeShow(raw);
        if (data?.id) _showCache.set(id, data);
        return data;
      } catch {
        console.warn(`Сериал библиотеки не загружен: ${id}`);
        return null;
      } finally {
        _showLoading.delete(id);
      }
    })();
    _showLoading.set(id, pending);
  }

  return pending;
}

export function findLibraryEpisode(show, seasonNum, epNum) {
  const season = (show?.seasons || []).find((s) => s.number === Number(seasonNum));
  return season?.episodes?.find((e) => e.number === Number(epNum)) ?? null;
}

export function listShowEpisodes(show) {
  const items = [];
  if (!show) return items;

  for (const season of (show.seasons || []).slice().sort((a, b) => a.number - b.number)) {
    for (const ep of (season.episodes || []).slice().sort((a, b) => a.number - b.number)) {
      items.push({
        season: season.number,
        episode: ep.number,
        title: ep.title || "",
        words: ep.words?.length || 0,
        phrases: ep.phrases?.length || 0,
        key: episodeKey(season.number, ep.number),
      });
    }
  }
  return items;
}

function lookupWordTranslations(show, lemma) {
  const map = show?.translations?.words || {};
  const key = normLemma(lemma);
  if (Array.isArray(map[key])) return map[key].filter(Boolean).slice(0, 3);
  for (const [k, v] of Object.entries(map)) {
    if (normLemma(k) === key && Array.isArray(v)) return v.filter(Boolean).slice(0, 3);
  }
  return [];
}

function lookupPhraseTranslations(show, text) {
  const map = show?.translations?.phrases || {};
  const key = normPhrase(text);
  if (Array.isArray(map[key])) return map[key].filter(Boolean).slice(0, 3);
  for (const [k, v] of Object.entries(map)) {
    if (normPhrase(k) === key && Array.isArray(v)) return v.filter(Boolean).slice(0, 3);
  }
  return [];
}

function resolveWordTranslations(show, lemma, dict) {
  const lib = lookupWordTranslations(show, lemma);
  if (lib.length) return lib;
  return dict ? translate(lemma, dict).filter(Boolean) : [];
}

function resolvePhraseTranslations(show, text, phrasesDb) {
  const lib = lookupPhraseTranslations(show, text);
  if (lib.length) return lib;
  return phrasesDb ? translatePhrase(text, phrasesDb).filter(Boolean) : [];
}

/**
 * Импорт выбранных серий из файла библиотеки в state.
 * @param {object} state
 * @param {object} show — объект из getLibraryShow
 * @param {Array<{ season: number, episode: number }>} selections
 * @param {{ dict?: object, phrasesDb?: object }} [opts]
 */
export function importLibraryEpisodes(state, show, selections, { dict = null, phrasesDb = null } = {}) {
  const result = {
    sources: [],
    words: { added: 0, updated: 0 },
    phrases: { added: 0, updated: 0 },
  };

  if (!show?.title || !Array.isArray(selections) || !selections.length) return result;

  const appShow = findOrCreateShow(state, show.title);

  for (const sel of selections) {
    const seasonNum = Number(sel.season);
    const epNum = Number(sel.episode);
    const libEp = findLibraryEpisode(show, seasonNum, epNum);
    if (!libEp) continue;

    const season = findOrCreateSeason(appShow, seasonNum);
    const ep = findOrCreateEpisode(season, epNum, libEp.title || "");
    const sourceId = ep.id;
    const label = `S${String(seasonNum).padStart(2, "0")}E${String(epNum).padStart(2, "0")}`
      + (libEp.title ? ` · ${libEp.title}` : "");

    setSourceVocabulary(state, sourceId, {
      words: libEp.words || [],
      phrases: libEp.phrases || [],
    });

    const wordItems = [];
    for (const lemma of libEp.words || []) {
      const l = normLemma(lemma);
      if (!l || isKnownLemma(state, l) || isStopWord(state, l)) continue;
      const existing = findWordByLemma(state, l);
      if (existing) {
        addSourceToItem(existing, sourceId);
        result.words.updated++;
        continue;
      }
      wordItems.push({
        lemma: String(lemma).trim(),
        translations: resolveWordTranslations(show, lemma, dict),
      });
    }
    if (wordItems.length) {
      const r = addWords(state, wordItems, sourceId);
      result.words.added += r.added;
      result.words.updated += r.updated;
    }

    const phraseItems = [];
    for (const text of libEp.phrases || []) {
      const t = normPhrase(text);
      if (!t || isKnownPhrase(state, t)) continue;
      const existing = findPhraseByText(state, t);
      if (existing) {
        addSourceToItem(existing, sourceId);
        result.phrases.updated++;
        continue;
      }
      phraseItems.push({
        text: String(text).trim(),
        translations: resolvePhraseTranslations(show, text, phrasesDb),
      });
    }
    if (phraseItems.length) {
      const r = addPhrases(state, phraseItems, sourceId);
      result.phrases.added += r.added;
      result.phrases.updated += r.updated;
    }

    result.sources.push({ sourceId, label, season: seasonNum, episode: epNum });
  }

  return result;
}
