import { tokenize, resolveLemma } from "./lemmatizer.js";
import {
  isKnownLemma, isKnownPhrase, isStopWord,
  isStudyingLemma, isStudyingPhrase,
} from "../db/database.js";

const MAX_PHRASE_WORDS = 5;

export function analyzeText(state, text, dict = null, formsIndex = null) {
  const tokens = tokenize(text);
  const map = new Map();

  for (const tok of tokens) {
    const lemma = resolveLemma(tok, dict, formsIndex);
    if (!lemma) continue;
    let entry = map.get(lemma);
    if (!entry) {
      entry = { count: 0, forms: new Set() };
      map.set(lemma, entry);
    }
    entry.count++;
    entry.forms.add(tok);
  }

  const result = [];
  for (const [lemma, entry] of map) {
    const known = isKnownLemma(state, lemma);
    const stop = !known && isStopWord(state, lemma);
    const studying = !known && !stop && isStudyingLemma(state, lemma);
    result.push({
      lemma,
      forms: [...entry.forms],
      count: entry.count,
      known,
      stop,
      studying,
      included: !known && !stop && !studying,
    });
  }

  result.sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
  return result;
}

export function analyzeSummary(words) {
  const active = words.filter((w) => !w.removed);
  const isNew = (w) => !w.known && !w.stop && !w.studying;
  const hasTrans = (w) => (w.translations || []).some(Boolean);

  return {
    total: active.length,
    knownCount: active.filter((w) => w.known).length,
    stopCount: active.filter((w) => w.stop).length,
    studyingCount: active.filter((w) => w.studying).length,
    noTransCount: active.filter((w) => !w.known && !w.stop && !hasTrans(w)).length,
    newCount: active.filter((w) => isNew(w) && hasTrans(w)).length,
  };
}

export function analyzePhrases(state, text, dict, formsIndex, phrasesDb) {
  if (!phrasesDb || !Object.keys(phrasesDb).length) return [];

  const tokens = tokenize(text);
  const lemmas = tokens
    .map((tok) => resolveLemma(tok, dict, formsIndex))
    .filter(Boolean);

  const counts = new Map();

  for (let i = 0; i < lemmas.length; i++) {
    const maxN = Math.min(MAX_PHRASE_WORDS, lemmas.length - i);
    for (let n = maxN; n >= 2; n--) {
      const candidate = lemmas.slice(i, i + n).join(" ");
      if (!phrasesDb[candidate]) continue;

      const entry = counts.get(candidate) || { text: candidate, count: 0 };
      entry.count++;
      counts.set(candidate, entry);
      break;
    }
  }

  const result = [];
  for (const [text, entry] of counts) {
    const known = isKnownPhrase(state, text);
    const studying = !known && isStudyingPhrase(state, text);
    result.push({
      text,
      count: entry.count,
      known,
      stop: false,
      studying,
      included: !known && !studying,
    });
  }

  result.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  return result;
}

export function phraseSummary(phrases) {
  return {
    total: phrases.length,
    newCount: phrases.filter((p) => !p.removed && !p.known && !p.studying).length,
    knownCount: phrases.filter((p) => p.known).length,
    studyingCount: phrases.filter((p) => p.studying).length,
  };
}
