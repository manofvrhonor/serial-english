import { todayStr, markWordLearned, markPhraseLearned, isTrainableItem } from "../db/database.js";
import { isSnapshotPrepItem } from "./readiness.js";

const WEIGHTS = [6, 3, 1];

export function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Не ставить подряд карточки одного слова/выражения (режим «Оба направления»). */
export function shuffleAvoidingAdjacent(items, keyFn = (x) => x.item?.id) {
  if (items.length <= 2) return shuffleArray(items);

  const arr = shuffleArray(items);
  for (let pass = 0; pass < arr.length * 3; pass++) {
    let moved = false;
    for (let i = 1; i < arr.length; i++) {
      if (keyFn(arr[i]) === keyFn(arr[i - 1])) {
        let swapped = false;
        for (let j = i + 1; j < arr.length; j++) {
          if (keyFn(arr[j]) === keyFn(arr[i - 1])) continue;
          if (j + 1 < arr.length && keyFn(arr[j]) === keyFn(arr[j + 1])) continue;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          swapped = true;
          moved = true;
          break;
        }
        if (!swapped) break;
      }
    }
    if (!moved) break;
  }
  return arr;
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDue(dueStr, today = todayStr()) {
  if (!dueStr) return true;
  return dueStr <= today;
}

export function pickWeightedTranslation(translations) {
  const list = (translations || []).filter(Boolean).slice(0, 3);
  if (!list.length) return "";
  if (list.length === 1) return list[0];

  let total = 0;
  const weighted = list.map((t, i) => {
    const w = WEIGHTS[i] ?? 1;
    total += w;
    return { t, w };
  });

  let r = Math.random() * total;
  for (const { t, w } of weighted) {
    r -= w;
    if (r <= 0) return t;
  }
  return list[0];
}

export function getItemTranslations(item) {
  return (item.translations || []).filter(Boolean).slice(0, 3);
}

export function formatTranslations(translations, separator = " · ") {
  return getItemTranslations({ translations }).join(separator);
}

function getEnglish(item, kind) {
  return kind === "word" ? item.lemma : item.text;
}

function choiceOptionForItem(item, kind, direction) {
  const english = getEnglish(item, kind);
  const allTrans = getItemTranslations(item);
  if (direction === "enru") {
    return {
      itemId: item.id,
      label: formatTranslations(allTrans),
      acceptable: allTrans,
    };
  }
  return {
    itemId: item.id,
    label: english,
    acceptable: [english],
  };
}

function collectDistractorCandidates(state, kind, direction, excludeId) {
  const candidates = [];
  const seen = new Set();

  const tryAdd = (it, k) => {
    if (it.id === excludeId) return;
    const opt = choiceOptionForItem(it, k, direction);
    if (!opt.label) return;
    const key = opt.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(opt);
  };

  const scan = (items, k, filterFn) => {
    for (const it of items || []) {
      if (!filterFn(it)) continue;
      tryAdd(it, k);
    }
  };

  const words = state.words || [];
  const phrases = state.phrases || [];

  if (kind === "word" || kind === "all") scan(words, "word", isTrainableItem);
  if (kind === "phrase" || kind === "all") scan(phrases, "phrase", isTrainableItem);

  if (candidates.length < 3) {
    if (kind === "word" || kind === "all") scan(words, "word", (it) => it.learned);
    if (kind === "phrase" || kind === "all") scan(phrases, "phrase", (it) => it.learned);
  }

  return candidates;
}

export function canUseChoiceMode(state, content = "words") {
  const trainable = (items) => (items || []).filter(isTrainableItem).length;
  if (content === "words") return trainable(state.words) >= 4;
  if (content === "phrases") return trainable(state.phrases) >= 4;
  return trainable(state.words) >= 4 && trainable(state.phrases) >= 4;
}

export function buildOptions(state, item, kind, direction, acceptableAnswers = null) {
  const correctOpt = choiceOptionForItem(item, kind, direction);
  const excludeKeys = new Set(
    (acceptableAnswers?.length ? acceptableAnswers : correctOpt.acceptable)
      .map((a) => String(a).toLowerCase())
  );
  const pool = shuffleArray(
    collectDistractorCandidates(state, kind, direction, item.id)
      .filter((c) => !c.acceptable.some((a) => excludeKeys.has(String(a).toLowerCase())))
      .filter((c) => c.label.toLowerCase() !== correctOpt.label.toLowerCase())
  );

  const wrong = [];
  for (const c of pool) {
    if (wrong.length >= 3) break;
    if (!wrong.some((x) => x.label.toLowerCase() === c.label.toLowerCase())) wrong.push(c);
  }

  if (wrong.length < 3) return null;

  return shuffleArray([correctOpt, ...wrong.slice(0, 3)]);
}

export function prepareCard(state, entry, mode) {
  const { kind, item, direction } = entry;
  const english = getEnglish(item, kind);
  const allTrans = getItemTranslations(item);
  const translationsText = formatTranslations(allTrans);

  const prompt = direction === "enru" ? english : translationsText;
  const answer = direction === "enru" ? translationsText : english;
  const acceptableAnswers = direction === "enru" ? allTrans : [english];

  let effectiveMode = mode;
  let options = [];
  if (mode === 3) {
    options = buildOptions(state, item, kind, direction, acceptableAnswers);
    if (!options) effectiveMode = 2;
  }

  return {
    kind,
    itemId: item.id,
    direction,
    mode: effectiveMode,
    prompt,
    answer,
    acceptableAnswers,
    options,
    label: kind === "word" ? item.lemma : item.text,
  };
}

export function buildSession(state, opts) {
  const { content = "all", direction = "both", dueOnly = true, sourceId = null } = opts;
  const today = todayStr();
  const entries = [];

  const matchesSource = (item, kind) => {
    if (!sourceId) return true;
    return isSnapshotPrepItem(state, sourceId, item, kind);
  };

  const addItems = (items, kind) => {
    for (const item of items) {
      if (!isTrainableItem(item)) continue;
      if (!matchesSource(item, kind)) continue;

      const dirs = direction === "both" ? ["enru", "ruen"] : [direction];
      for (const dir of dirs) {
        const side = item.srs?.[dir];
        if (!side) continue;
        if (dueOnly && !isDue(side.due, today)) continue;
        entries.push({ kind, item, direction: dir });
      }
    }
  };

  if (content === "words" || content === "all") addItems(state.words, "word");
  if (content === "phrases" || content === "all") addItems(state.phrases, "phrase");

  return shuffleAvoidingAdjacent(entries);
}

export function resolveMode(sessionMode) {
  if (sessionMode === "mix") return 1 + Math.floor(Math.random() * 3);
  return Number(sessionMode) || 1;
}

export function applyAnswer(state, entry, mode, correct) {
  const { kind, item, direction } = entry;
  const intervals = state.settings?.intervals || [1, 3, 7, 16, 30];
  const side = item.srs[direction];
  const modeKey = `mode${mode}`;
  const today = todayStr();

  if (correct) {
    side.checks[modeKey] = true;
    const allChecked = side.checks.mode1 && side.checks.mode2 && side.checks.mode3;
    if (allChecked) {
      if (side.level < 5) {
        side.level += 1;
        const idx = Math.min(side.level - 1, intervals.length - 1);
        side.due = addDays(today, intervals[idx] ?? 1);
        side.checks = { mode1: false, mode2: false, mode3: false };
      } else {
        checkFullyLearned(state, item, kind);
      }
    }
  } else {
    if (side.level > 0) side.level -= 1;
    side.checks = { mode1: false, mode2: false, mode3: false };
    side.due = today;
  }

  return side;
}

function checkFullyLearned(state, item, kind) {
  const en = item.srs.enru;
  const ru = item.srs.ruen;
  const enDone = en.level >= 5 && en.checks.mode1 && en.checks.mode2 && en.checks.mode3;
  const ruDone = ru.level >= 5 && ru.checks.mode1 && ru.checks.mode2 && ru.checks.mode3;
  if (enDone && ruDone) {
    if (kind === "word") markWordLearned(state, item.id);
    else markPhraseLearned(state, item.id);
  }
}

export function countTrainingItems(state, opts = {}) {
  const { content = "all", direction = "both", dueOnly = true, sourceId = null } = opts;
  const today = todayStr();

  const matchesSource = (item, kind) => {
    if (!sourceId) return true;
    return isSnapshotPrepItem(state, sourceId, item, kind);
  };

  const isItemIncluded = (item, kind) => {
    if (!isTrainableItem(item)) return false;
    if (!matchesSource(item, kind)) return false;

    const dirs = direction === "both" ? ["enru", "ruen"] : [direction];
    for (const dir of dirs) {
      const side = item.srs?.[dir];
      if (!side) continue;
      if (!dueOnly || isDue(side.due, today)) return true;
    }
    return false;
  };

  let n = 0;
  if (content === "words" || content === "all") {
    n += (state.words || []).filter((item) => isItemIncluded(item, "word")).length;
  }
  if (content === "phrases" || content === "all") {
    n += (state.phrases || []).filter((item) => isItemIncluded(item, "phrase")).length;
  }
  return n;
}

/** Подписи режимов карточек (setup и badge в сессии) — сверять с docs/agent-spec.md §8.1 */
export const TRAINING_MODE_LABELS = {
  1: "Слово + перевод",
  2: "Перевод по клику",
  3: "4 варианта",
  mix: "Смешанный",
};

export const TRAINING_MODE_HINTS = {
  1: "Слово и перевод сразу. Отметьте «Знал» или «Не знал».",
  2: "Покажется слово — нажмите, чтобы открыть перевод.",
  3: "Слово и 4 варианта — выберите правильный.",
  mix: "Каждая карточка случайно в одном из трёх режимов.",
};

export const TRAINING_MODE_ORDER = ["1", "2", "3", "mix"];

export function directionLabel(dir) {
  return dir === "enru" ? "EN→RU" : "RU→EN";
}

export function modeLabel(mode) {
  return TRAINING_MODE_LABELS[mode] || "";
}
