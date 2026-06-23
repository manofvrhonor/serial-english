// ===== Готовность источника (серия / глава) — по снимку лексики файла =====

import {
  findWordByLemma,
  findPhraseByText,
  isKnownLemma,
  isKnownPhrase,
  isStopWord,
  addWords,
  addPhrases,
} from "../db/database.js";
import { translate } from "../import/dictionary.js";
import { translatePhrase } from "../import/phrases.js";

/** @typedef {'known'|'stop'|'noTrans'|'studying'} SnapshotStatus */

export function getSourceNode(state, sourceId) {
  if (!sourceId) return null;

  for (const show of state.shows || []) {
    for (const season of show.seasons || []) {
      for (const ep of season.episodes || []) {
        if (ep.id === sourceId) return ep;
      }
    }
  }

  for (const book of state.books || []) {
    for (const ch of book.chapters || []) {
      if (ch.id === sourceId) return ch;
    }
  }

  return null;
}

export function getSourceVocabulary(state, sourceId) {
  const node = getSourceNode(state, sourceId);
  const vocab = node?.vocabulary;
  return {
    words: Array.isArray(vocab?.words) ? vocab.words : [],
    phrases: Array.isArray(vocab?.phrases) ? vocab.phrases : [],
  };
}

export function hasVocabularySnapshot(state, sourceId) {
  const { words, phrases } = getSourceVocabulary(state, sourceId);
  return words.length > 0 || phrases.length > 0;
}

function wordHasTranslation(state, lemma) {
  const word = findWordByLemma(state, lemma);
  return Boolean(word?.translations?.some(Boolean));
}

function phraseHasTranslation(state, text) {
  const phrase = findPhraseByText(state, text);
  return Boolean(phrase?.translations?.some(Boolean));
}

/** Классификация слова из снимка по глобальному статусу. */
export function classifyWordStatus(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l) return "noTrans";

  if (isKnownLemma(state, l) || findWordByLemma(state, l)?.learned) return "known";
  if (isStopWord(state, l)) return "stop";

  const word = findWordByLemma(state, l);
  if (word) {
    return wordHasTranslation(state, l) ? "studying" : "noTrans";
  }
  return "noTrans";
}

/** Классификация выражения из снимка по глобальному статусу. */
export function classifyPhraseStatus(state, text) {
  const t = String(text).toLowerCase().trim();
  if (!t) return "noTrans";

  if (isKnownPhrase(state, t) || findPhraseByText(state, t)?.learned) return "known";

  const phrase = findPhraseByText(state, t);
  if (phrase) {
    return phraseHasTranslation(state, t) ? "studying" : "noTrans";
  }
  return "noTrans";
}

/** Есть ли в снимке слова/фразы без карточки в базе (кроме знаю/стоп). */
export function sourceNeedsMaterialize(state, sourceId) {
  const { words, phrases } = getSourceVocabulary(state, sourceId);

  for (const lemma of words) {
    const l = String(lemma).toLowerCase().trim();
    if (!l || isKnownLemma(state, l) || isStopWord(state, l)) continue;
    if (!findWordByLemma(state, l)) return true;
  }

  for (const text of phrases) {
    const t = String(text).toLowerCase().trim();
    if (!t || isKnownPhrase(state, t)) continue;
    if (!findPhraseByText(state, t)) return true;
  }

  return false;
}

/**
 * Слова из снимка без карточки → в изучение (с переводом) или без перевода.
 * Возвращает true, если база изменилась.
 */
export function ensureSnapshotItems(state, sourceId, dict, phrasesDb) {
  if (!sourceId) return false;

  let changed = false;
  const { words, phrases } = getSourceVocabulary(state, sourceId);

  for (const lemma of words) {
    const l = String(lemma).toLowerCase().trim();
    if (!l || isKnownLemma(state, l) || isStopWord(state, l) || findWordByLemma(state, l)) continue;
    const translations = dict ? translate(lemma, dict).filter(Boolean) : [];
    addWords(state, [{ lemma: String(lemma).trim(), translations }], sourceId);
    changed = true;
  }

  for (const text of phrases) {
    const t = String(text).toLowerCase().trim();
    if (!t || isKnownPhrase(state, t) || findPhraseByText(state, t)) continue;
    const translations = phrasesDb ? translatePhrase(text, phrasesDb).filter(Boolean) : [];
    addPhrases(state, [{ text: String(text).trim(), translations }], sourceId);
    changed = true;
  }

  return changed;
}

function countStatuses(state, words, phrases) {
  const counts = { known: 0, stop: 0, noTrans: 0, studying: 0 };

  for (const lemma of words) {
    counts[classifyWordStatus(state, lemma)]++;
  }
  for (const text of phrases) {
    counts[classifyPhraseStatus(state, text)]++;
  }

  return counts;
}

function buildReadinessFromCounts(counts, total) {
  const { known, stop, noTrans, studying } = counts;
  const ready = known + stop;
  const unlearned = studying + noTrans;
  const percent = total ? Math.round((ready / total) * 100) : 0;

  return {
    total,
    ready,
    learned: known,
    percent,
    unlearned,
    known,
    stop,
    noTrans,
    studying,
    hasSnapshot: true,
  };
}

export function calcVocabularyReadiness(state, words, phrases) {
  const wordList = [...new Set(words.map((w) => String(w).toLowerCase().trim()).filter(Boolean))];
  const phraseList = [...new Set(phrases.map((p) => String(p).toLowerCase().trim()).filter(Boolean))];
  const total = wordList.length + phraseList.length;
  return buildReadinessFromCounts(countStatuses(state, wordList, phraseList), total);
}

// Legacy fallback — карточки с привязкой sources
export function getWordsForSource(state, sourceId) {
  return (state.words || []).filter((w) => (w.sources || []).includes(sourceId));
}

export function getPhrasesForSource(state, sourceId) {
  return (state.phrases || []).filter((p) => (p.sources || []).includes(sourceId));
}

function calcLegacyReadiness(state, sourceId) {
  const items = [...getWordsForSource(state, sourceId), ...getPhrasesForSource(state, sourceId)];
  const total = items.length;
  const learned = items.filter((x) => x.learned).length;
  const percent = total ? Math.round((learned / total) * 100) : 0;
  return {
    total,
    ready: learned,
    learned,
    percent,
    unlearned: total - learned,
    known: learned,
    stop: 0,
    noTrans: 0,
    studying: total - learned,
    hasSnapshot: false,
  };
}

export function calcReadiness(state, sourceId) {
  const { words, phrases } = getSourceVocabulary(state, sourceId);
  if (words.length || phrases.length) {
    return calcVocabularyReadiness(state, words, phrases);
  }
  return calcLegacyReadiness(state, sourceId);
}

export function calcReadinessForSources(state, sourceIds) {
  const wordSet = new Set();
  const phraseSet = new Set();
  let hasSnapshot = false;

  for (const sid of sourceIds) {
    const { words, phrases } = getSourceVocabulary(state, sid);
    if (words.length || phrases.length) {
      hasSnapshot = true;
      words.forEach((w) => wordSet.add(w));
      phrases.forEach((p) => phraseSet.add(p));
    }
  }

  if (hasSnapshot) {
    return calcVocabularyReadiness(state, [...wordSet], [...phraseSet]);
  }

  const seen = new Set();
  let total = 0;
  let learned = 0;

  for (const sid of sourceIds) {
    const items = [...getWordsForSource(state, sid), ...getPhrasesForSource(state, sid)];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      total++;
      if (item.learned) learned++;
    }
  }

  const percent = total ? Math.round((learned / total) * 100) : 0;
  return {
    total,
    ready: learned,
    learned,
    percent,
    unlearned: total - learned,
    known: learned,
    stop: 0,
    noTrans: 0,
    studying: total - learned,
    hasSnapshot: false,
  };
}

/** Подготовка к просмотру/чтению — только «не готово» по снимку. */
export function isSnapshotPrepItem(state, sourceId, item, kind) {
  if (!sourceId) return true;

  const { words, phrases } = getSourceVocabulary(state, sourceId);
  if (!words.length && !phrases.length) {
    return (item.sources || []).includes(sourceId);
  }

  const key = kind === "word"
    ? String(item.lemma).toLowerCase().trim()
    : String(item.text).toLowerCase().trim();
  const inSnapshot = kind === "word" ? words.includes(key) : phrases.includes(key);
  if (!inSnapshot) return false;

  const status = kind === "word"
    ? classifyWordStatus(state, key)
    : classifyPhraseStatus(state, key);
  return status === "studying";
}

export function readinessBadge(readiness) {
  if (!readiness.total) return "—";
  if (readiness.hasSnapshot) {
    return `${readiness.ready}/${readiness.total} готово`;
  }
  return `${readiness.learned}/${readiness.total} изучено`;
}

export function getSnapshotEntries(state, sourceId) {
  const { words, phrases } = getSourceVocabulary(state, sourceId);
  const hasSnapshot = words.length > 0 || phrases.length > 0;

  if (hasSnapshot) {
    return {
      hasSnapshot: true,
      words: words.map((lemma) => ({
        kind: "word",
        key: lemma,
        status: classifyWordStatus(state, lemma),
        item: findWordByLemma(state, lemma),
      })),
      phrases: phrases.map((text) => ({
        kind: "phrase",
        key: text,
        status: classifyPhraseStatus(state, text),
        item: findPhraseByText(state, text),
      })),
    };
  }

  const legacyWords = getWordsForSource(state, sourceId).map((w) => ({
    kind: "word",
    key: w.lemma,
    status: w.learned ? "known" : ((w.translations || []).some(Boolean) ? "studying" : "noTrans"),
    item: w,
  }));
  const legacyPhrases = getPhrasesForSource(state, sourceId).map((p) => ({
    kind: "phrase",
    key: p.text,
    status: p.learned ? "known" : ((p.translations || []).some(Boolean) ? "studying" : "noTrans"),
    item: p,
  }));

  return {
    hasSnapshot: false,
    words: legacyWords,
    phrases: legacyPhrases,
  };
}

export function readinessTooltip(readiness) {
  if (!readiness.total) return "Нет данных о лексике";

  if (readiness.hasSnapshot) {
    const parts = [
      `Готово: ${readiness.ready}/${readiness.total}`,
      `выучено ${readiness.known}`,
      `стоп ${readiness.stop}`,
      `без перевода ${readiness.noTrans}`,
    ];
    if (readiness.studying) parts.push(`изучать ${readiness.studying}`);
    return parts.join(" · ");
  }

  return `${readiness.learned} из ${readiness.total} (${readiness.percent}%)`;
}

export function snapshotProgressBarHtml(readiness) {
  const { total, known, stop, noTrans, studying } = readiness;

  if (!total) {
    return `<div class="prog-bar-thin prog-bar-empty" title="Нет снимка лексики — импортируйте файл"></div>`;
  }

  const tooltip = readinessTooltip(readiness);
  const knownPct = (known / total) * 100;
  const studyingPct = (studying / total) * 100;
  const stopPct = (stop / total) * 100;
  const noTransPct = (noTrans / total) * 100;

  const segs = [];
  if (knownPct > 0) {
    segs.push(`<div class="prog-seg prog-seg-known" style="width:${knownPct}%"></div>`);
  }
  if (studyingPct > 0) {
    segs.push(`<div class="prog-seg prog-seg-studying" style="width:${studyingPct}%"></div>`);
  }
  if (stopPct > 0) {
    segs.push(`<div class="prog-seg prog-seg-stop" style="width:${stopPct}%"></div>`);
  }
  if (noTransPct > 0) {
    segs.push(`<div class="prog-seg prog-seg-notrans" style="width:${noTransPct}%"></div>`);
  }

  return `<div class="prog-bar-thin prog-bar-multi" title="${escAttr(tooltip)}">${segs.join("")}</div>`;
}

export function progressBarHtml(readiness, compact = false) {
  if (readiness.hasSnapshot) {
    return snapshotProgressBarHtml(readiness);
  }

  const { total, learned, percent } = readiness;
  if (total === 0) {
    return `<span class="prog-empty">${compact ? "—" : "нет слов"}</span>`;
  }
  return `
    <div class="prog-wrap${compact ? " prog-compact" : ""}">
      <div class="prog-bar" title="${learned} из ${total} (${percent}%)">
        <div class="prog-fill" style="width:${percent}%"></div>
      </div>
      <span class="prog-text">${learned}/${total}</span>
    </div>`;
}

export function episodeLabel(season, ep) {
  const code = `S${String(season.number).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;
  return ep.title ? `${code} · ${ep.title}` : code;
}

export function chapterLabel(ch) {
  return ch.title ? `Глава ${ch.number} · ${ch.title}` : `Глава ${ch.number}`;
}

function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
