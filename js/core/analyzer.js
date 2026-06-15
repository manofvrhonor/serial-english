import { tokenize, resolveLemma } from "./lemmatizer.js";
import { isKnownLemma, isKnownPhrase, isStopWord } from "../db/database.js";

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
    const stop = isStopWord(state, lemma);
    result.push({
      lemma,
      forms: [...entry.forms],
      count: entry.count,
      known,
      stop,
      included: !known && !stop,
    });
  }

  result.sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
  return result;
}

export function analyzeSummary(words) {
  return {
    total: words.length,
    newCount: words.filter((w) => w.included).length,
    knownCount: words.filter((w) => w.known).length,
    stopCount: words.filter((w) => w.stop).length,
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
    result.push({
      text,
      count: entry.count,
      known,
      stop: false,
      included: !known,
    });
  }

  result.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  return result;
}

export function phraseSummary(phrases) {
  return {
    total: phrases.length,
    newCount: phrases.filter((p) => p.included).length,
    knownCount: phrases.filter((p) => p.known).length,
  };
}
