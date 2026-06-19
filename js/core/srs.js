import { todayStr, markWordLearned, markPhraseLearned, isTrainableItem } from "../db/database.js";

const WEIGHTS = [6, 3, 1];

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

function getEnglish(item, kind) {
  return kind === "word" ? item.lemma : item.text;
}

function collectPool(state, kind, direction, excludeId) {
  const pool = [];
  const add = (items, k) => {
    for (const it of items) {
      if (it.learned || it.id === excludeId) continue;
      const trans = (it.translations || []).filter(Boolean);
      if (!trans.length) continue;
      if (direction === "enru") {
        for (const t of trans) pool.push(t);
      } else {
        pool.push(k === "word" ? it.lemma : it.text);
      }
    }
  };
  add(state.words, "word");
  add(state.phrases, "phrase");
  return [...new Set(pool)];
}

export function buildOptions(state, item, kind, direction, correct) {
  const pool = collectPool(state, kind, direction, item.id)
    .filter((x) => x.toLowerCase() !== String(correct).toLowerCase());

  const wrong = [];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  for (const w of shuffled) {
    if (wrong.length >= 3) break;
    if (!wrong.some((x) => x.toLowerCase() === w.toLowerCase())) wrong.push(w);
  }

  while (wrong.length < 3) {
    wrong.push(wrong.length === 0 ? "—" : `вариант ${wrong.length + 1}`);
  }

  const options = [correct, ...wrong.slice(0, 3)];
  return options.sort(() => Math.random() - 0.5);
}

export function prepareCard(state, entry, mode) {
  const { kind, item, direction } = entry;
  const english = getEnglish(item, kind);
  const correctTrans = pickWeightedTranslation(item.translations);

  const prompt = direction === "enru" ? english : correctTrans;
  const answer = direction === "enru" ? correctTrans : english;

  return {
    kind,
    itemId: item.id,
    direction,
    mode,
    prompt,
    answer,
    options: mode === 3 ? buildOptions(state, item, kind, direction, answer) : [],
    label: kind === "word" ? item.lemma : item.text,
  };
}

export function buildSession(state, opts) {
  const { content = "all", direction = "both", dueOnly = true, sourceId = null } = opts;
  const today = todayStr();
  const entries = [];

  const matchesSource = (item) => {
    if (!sourceId) return true;
    return (item.sources || []).includes(sourceId);
  };

  const addItems = (items, kind) => {
    for (const item of items) {
      if (!isTrainableItem(item)) continue;
      if (!matchesSource(item)) continue;

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

  return entries.sort(() => Math.random() - 0.5);
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

  const matchesSource = (item) => {
    if (!sourceId) return true;
    return (item.sources || []).includes(sourceId);
  };

  const isItemIncluded = (item) => {
    if (!isTrainableItem(item)) return false;
    if (!matchesSource(item)) return false;

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
    n += (state.words || []).filter(isItemIncluded).length;
  }
  if (content === "phrases" || content === "all") {
    n += (state.phrases || []).filter(isItemIncluded).length;
  }
  return n;
}

/** @deprecated use countTrainingItems — считал EN→RU и RU→EN отдельно */
export function countDue(state) {
  return countTrainingItems(state, { content: "all", direction: "both", dueOnly: true });
}

export function directionLabel(dir) {
  return dir === "enru" ? "EN→RU" : "RU→EN";
}

export function modeLabel(mode) {
  return ({ 1: "Слово + перевод", 2: "Перевод по клику", 3: "4 варианта" })[mode] || "";
}
