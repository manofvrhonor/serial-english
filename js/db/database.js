// ===== Работа с IndexedDB + схема v2 =====

const DB_NAME = "serial-english";
const DB_VERSION = 1;
const STORE = "state";
const STATE_KEY = "main";
const SCHEMA_VERSION = 2;

/** Встроенный стоп-лист (legacy) — при загрузке удаляется из сохранённых данных. */
const BUILTIN_STOP_LIST = [
  "a", "an", "the",
  "i", "you", "he", "she", "it", "we", "they",
  "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their",
  "this", "that", "these", "those",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "do", "does", "did",
  "have", "has", "had",
  "and", "or", "but", "so", "if", "then",
  "to", "of", "in", "on", "at", "for", "with", "from", "by",
  "as", "not", "no", "yes",
];

const BUILTIN_STOP_SET = new Set(BUILTIN_STOP_LIST.map((s) => s.toLowerCase()));

function stopEntryLemma(entry) {
  if (typeof entry === "string") return String(entry).toLowerCase().trim();
  return String(entry?.lemma ?? "").toLowerCase().trim();
}

function normalizeStopEntry(entry) {
  if (typeof entry === "string") {
    return { lemma: String(entry).trim(), translations: [], sources: [], manual: false };
  }
  return {
    lemma: String(entry?.lemma ?? "").trim(),
    translations: Array.isArray(entry?.translations)
      ? entry.translations.filter(Boolean).slice(0, 3)
      : [],
    sources: Array.isArray(entry?.sources) ? entry.sources.filter(Boolean) : [],
    manual: Boolean(entry?.manual),
  };
}

function normalizeStopList(list) {
  const seen = new Map();
  for (const raw of list || []) {
    const entry = normalizeStopEntry(raw);
    if (!entry.lemma || BUILTIN_STOP_SET.has(entry.lemma.toLowerCase())) continue;
    const key = entry.lemma.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, entry);
      continue;
    }
    const prev = seen.get(key);
    if (entry.translations.length && !prev.translations.length) {
      prev.translations = entry.translations;
    }
    if (entry.sources.length && !prev.sources.length) {
      prev.sources = entry.sources;
    }
    if (entry.manual) prev.manual = true;
  }
  return [...seen.values()].sort((a, b) => a.lemma.localeCompare(b.lemma));
}

// ---------- Генератор id ----------
export function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// ---------- Пустое состояние (схема v2) ----------
export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      intervals: [1, 3, 7, 16, 30],
      stopList: [],
      sessionHistory: [],
      lastSession: null,
    },
    shows: [],   // [{ id, title, seasons:[{ id, number, episodes:[{id,number,title}] }] }]
    books: [],   // [{ id, title, chapters:[{ id, number, title }] }]
    words: [],
    phrases: [],
    knowledge: { wordLemmas: [], phrases: [] },
  };
}

// ---------- Заготовки SRS (схема v2: level, checks, due) ----------
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function emptySrsSide() {
  return {
    level: 0,
    checks: { mode1: false, mode2: false, mode3: false },
    due: todayStr(),
  };
}
export function emptySrs() {
  return { enru: emptySrsSide(), ruen: emptySrsSide() };
}

// ---------- Фабрики сущностей ----------
export function makeWord({ lemma, forms = [], translations = [], sources = [], manual = false }) {
  return {
    id: makeId("w"),
    lemma,
    forms,
    translations,
    sources: Array.isArray(sources) ? sources : (sources ? [sources] : []),
    learned: false,
    manual: Boolean(manual),
    srs: emptySrs(),
    createdAt: Date.now(),
  };
}

export function makePhrase({ text, translations = [], sources = [], manual = false }) {
  return {
    id: makeId("p"),
    text,
    translations,
    sources: Array.isArray(sources) ? sources : (sources ? [sources] : []),
    learned: false,
    manual: Boolean(manual),
    srs: emptySrs(),
    createdAt: Date.now(),
  };
}

// ===================================================================
//  IndexedDB: открытие, чтение, запись
// ===================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState() {
  const db = await openDB();
  const raw = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  if (!raw) {
    const fresh = emptyState();
    await saveState(fresh);
    return fresh;
  }
  // Прогоняем через нормализацию (миграция/добивка недостающих полей)
  const normalized = normalizeState(raw);
  let needsSave = false;
  if (JSON.stringify(raw?.settings?.stopList) !== JSON.stringify(normalized.settings?.stopList)) {
    needsSave = true;
  }
  if (repairKnowledgeWordCards(normalized)) {
    needsSave = true;
  }
  if (needsSave) {
    await saveState(normalized);
  }
  return normalized;
}

export async function saveState(state) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===================================================================
//  Валидация и нормализация состояния
// ===================================================================

// Грубая проверка: можно ли вообще это считать нашим состоянием.
export function isValidState(data) {
  if (!data || typeof data !== "object") return false;
  // обязательные коллекции должны быть массивами/объектами
  const arrays = ["shows", "books", "words", "phrases"];
  for (const key of arrays) {
    if (key in data && !Array.isArray(data[key])) return false;
  }
  if ("settings" in data && typeof data.settings !== "object") return false;
  return true;
}

// Добивает недостающие поля и приводит старые версии к актуальной.
// Никогда не падает: чего нет — подставляет дефолт.
export function normalizeState(data) {
  const base = emptyState();
  if (!data || typeof data !== "object") return base;

  const state = {
    version: SCHEMA_VERSION,
    settings: {
      intervals: Array.isArray(data?.settings?.intervals)
        ? data.settings.intervals.map((n) => Math.max(1, Number(n) || 1)).slice(0, 5)
        : base.settings.intervals,
      stopList: Array.isArray(data?.settings?.stopList)
        ? normalizeStopList(data.settings.stopList)
        : [],
      sessionHistory: Array.isArray(data?.settings?.sessionHistory)
        ? data.settings.sessionHistory.slice(0, 20)
        : [],
      lastSession: data?.settings?.lastSession && typeof data.settings.lastSession === "object"
        ? data.settings.lastSession
        : null,
    },
    shows: Array.isArray(data.shows) ? data.shows.map(normalizeShow) : [],
    books: Array.isArray(data.books) ? data.books.map(normalizeBook) : [],
    words: Array.isArray(data.words) ? data.words.map(normalizeWord) : [],
    phrases: Array.isArray(data.phrases) ? data.phrases.map(normalizePhrase) : [],
    knowledge: {
      wordLemmas: Array.isArray(data?.knowledge?.wordLemmas)
        ? data.knowledge.wordLemmas
        : [],
      phrases: Array.isArray(data?.knowledge?.phrases)
        ? data.knowledge.phrases
        : [],
    },
  };
  return state;
}

function normalizeSrsSide(side) {
  const today = todayStr();

  if (side?.checks && typeof side.level === "number") {
    return {
      level: Math.min(5, Math.max(0, side.level)),
      checks: {
        mode1: Boolean(side.checks.mode1),
        mode2: Boolean(side.checks.mode2),
        mode3: Boolean(side.checks.mode3),
      },
      due: typeof side.due === "string" && side.due ? side.due : today,
    };
  }

  // Миграция со старой схемы { box, due, history }
  const level = Number.isInteger(side?.box) ? Math.min(5, Math.max(0, side.box)) : 0;
  let due = today;
  if (typeof side?.due === "number") {
    due = new Date(side.due).toISOString().slice(0, 10);
  } else if (typeof side?.due === "string" && side.due) {
    due = side.due;
  }
  return {
    level,
    checks: { mode1: false, mode2: false, mode3: false },
    due,
  };
}
function normalizeSrs(srs) {
  return {
    enru: normalizeSrsSide(srs?.enru),
    ruen: normalizeSrsSide(srs?.ruen),
  };
}

// Приводит старое поле source (одиночное) к массиву sources.
// Поддерживает оба формата: для уже мигрированных данных и для старых.
function toSources(item) {
  if (Array.isArray(item?.sources)) return item.sources.filter(Boolean);
  if (item?.source) return [item.source]; // миграция со старой схемы
  return [];
}

function normalizeWord(w) {
  return {
    id: w?.id || makeId("w"),
    lemma: String(w?.lemma ?? ""),
    forms: Array.isArray(w?.forms) ? w.forms : [],
    translations: Array.isArray(w?.translations) ? w.translations : [],
    sources: toSources(w),
    learned: Boolean(w?.learned),
    manual: Boolean(w?.manual),
    srs: normalizeSrs(w?.srs),
    createdAt: typeof w?.createdAt === "number" ? w.createdAt : Date.now(),
  };
}

function normalizePhrase(p) {
  return {
    id: p?.id || makeId("p"),
    text: String(p?.text ?? ""),
    translations: Array.isArray(p?.translations) ? p.translations : [],
    sources: toSources(p),
    learned: Boolean(p?.learned),
    manual: Boolean(p?.manual),
    srs: normalizeSrs(p?.srs),
    createdAt: typeof p?.createdAt === "number" ? p.createdAt : Date.now(),
  };
}

function normalizeVocabulary(vocab) {
  if (!vocab || typeof vocab !== "object") {
    return { words: [], phrases: [] };
  }
  const words = Array.isArray(vocab.words)
    ? [...new Set(vocab.words.map((w) => String(w).toLowerCase().trim()).filter(Boolean))]
    : [];
  const phrases = Array.isArray(vocab.phrases)
    ? [...new Set(vocab.phrases.map((p) => String(p).toLowerCase().trim()).filter(Boolean))]
    : [];
  return { words, phrases };
}

function normalizeShow(s) {
  return {
    id: s?.id || makeId("show"),
    title: String(s?.title ?? "Без названия"),
    seasons: Array.isArray(s?.seasons)
      ? s.seasons.map((season) => ({
          id: season?.id || makeId("season"),
          number: Number.isInteger(season?.number) ? season.number : 0,
          episodes: Array.isArray(season?.episodes)
            ? season.episodes.map((ep) => ({
                id: ep?.id || makeId("ep"),
                number: Number.isInteger(ep?.number) ? ep.number : 0,
                title: String(ep?.title ?? ""),
                vocabulary: normalizeVocabulary(ep?.vocabulary),
              }))
            : [],
        }))
      : [],
  };
}

function normalizeBook(b) {
  return {
    id: b?.id || makeId("book"),
    title: String(b?.title ?? "Без названия"),
    chapters: Array.isArray(b?.chapters)
      ? b.chapters.map((ch) => ({
          id: ch?.id || makeId("ch"),
          number: Number.isInteger(ch?.number) ? ch.number : 0,
          title: String(ch?.title ?? ""),
          vocabulary: normalizeVocabulary(ch?.vocabulary),
        }))
      : [],
  };
}

// ===================================================================
//  Экспорт / Импорт файла (с валидацией)
// ===================================================================
export async function exportToFile() {
  const state = await loadState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `serial-english-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file) {
  const text = await file.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Файл не является корректным JSON.");
  }

  if (!isValidState(data)) {
    throw new Error("Структура файла не подходит (это не данные Serial English).");
  }

  const normalized = normalizeState(data); // добиваем поля + версия
  await saveState(normalized);
  return normalized;
}

// ===================================================================
//  ХЕЛПЕРЫ ДЛЯ ИМПОРТА (работают над объектом state, не пишут в БД)
// ===================================================================

// --- Сериалы: найти/создать сериал ---
export function findOrCreateShow(state, title) {
  const t = String(title).trim();
  let show = state.shows.find((s) => s.title.toLowerCase() === t.toLowerCase());
  if (!show) {
    show = { id: makeId("show"), title: t, seasons: [] };
    state.shows.push(show);
  }
  return show;
}

// --- Сериалы: найти/создать сезон по номеру ---
export function findOrCreateSeason(show, number) {
  const num = Number(number) || 0;
  let season = show.seasons.find((s) => s.number === num);
  if (!season) {
    season = { id: makeId("season"), number: num, episodes: [] };
    show.seasons.push(season);
    show.seasons.sort((a, b) => a.number - b.number);
  }
  return season;
}

// --- Сериалы: найти/создать серию по номеру ---
export function findOrCreateEpisode(season, number, title = "") {
  const num = Number(number) || 0;
  let ep = season.episodes.find((e) => e.number === num);
  if (!ep) {
    ep = { id: makeId("ep"), number: num, title: String(title || "").trim() };
    season.episodes.push(ep);
    season.episodes.sort((a, b) => a.number - b.number);
  } else if (title && !ep.title) {
    ep.title = String(title).trim();
  }
  return ep;
}

// --- Книги: найти/создать книгу ---
export function findOrCreateBook(state, title) {
  const t = String(title).trim();
  let book = state.books.find((b) => b.title.toLowerCase() === t.toLowerCase());
  if (!book) {
    book = { id: makeId("book"), title: t, chapters: [] };
    state.books.push(book);
  }
  return book;
}

// --- Книги: найти/создать главу по номеру ---
export function findOrCreateChapter(book, number, title = "") {
  const num = Number(number) || 0;
  let ch = book.chapters.find((c) => c.number === num);
  if (!ch) {
    ch = { id: makeId("ch"), number: num, title: String(title || "").trim() };
    book.chapters.push(ch);
    book.chapters.sort((a, b) => a.number - b.number);
  } else if (title && !ch.title) {
    ch.title = String(title).trim();
  }
  return ch;
}

// --- Слова: найти по лемме (регистронезависимо) ---
export function findWordByLemma(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  return state.words.find((w) => w.lemma.toLowerCase() === l) || null;
}

// --- Выражения: найти по тексту ---
export function findPhraseByText(state, text) {
  const t = String(text).toLowerCase().trim();
  return state.phrases.find((p) => p.text.toLowerCase() === t) || null;
}

// --- Добавить источник элементу (без дублей) ---
export function addSourceToItem(item, sourceId) {
  if (!sourceId) return item;
  if (!Array.isArray(item.sources)) item.sources = [];
  if (!item.sources.includes(sourceId)) item.sources.push(sourceId);
  return item;
}

// --- Проверка: лемма в Базе знаний? (исключается из импорта) ---
export function isKnownLemma(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  return state.knowledge.wordLemmas.some((x) => String(x).toLowerCase() === l);
}

// --- Проверка: фраза в Базе знаний? ---
export function isKnownPhrase(state, text) {
  const t = String(text).toLowerCase().trim();
  return state.knowledge.phrases.some((x) => String(x).toLowerCase() === t);
}

// --- Проверка: лемма в стоп-листе? ---
export function isStopWord(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  return (state.settings.stopList || []).some((x) => stopEntryLemma(x) === l);
}

export function isStudyingLemma(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  return (state.words || []).some(
    (w) => !w.learned && String(w.lemma).toLowerCase() === l
  );
}

export function isStudyingPhrase(state, text) {
  const t = String(text).toLowerCase().trim();
  return (state.phrases || []).some(
    (p) => !p.learned && String(p.text).toLowerCase() === t
  );
}


// ===================================================================
//  ДОБАВЛЕНИЕ СЛОВ ИЗ ИМПОРТА (работает над state, не пишет в БД сам)
// ===================================================================
// items: [{ lemma, forms }], source: ярлык источника (напр. "S01E01")
// Возвращает { added, updated }.
export function addWords(state, items, source) {
  let added = 0;
  let updated = 0;

  for (const it of items) {
    const lemma = String(it?.lemma ?? "").trim();
    if (!lemma) continue;

    let word = findWordByLemma(state, lemma);
    const translations = Array.isArray(it?.translations)
      ? it.translations.filter(Boolean).slice(0, 3)
      : [];

    if (!word) {
      word = makeWord({ lemma, forms: it.forms || [], translations });
      state.words.push(word);
      added++;
    } else {
      const set = new Set([...(word.forms || []), ...(it.forms || [])]);
      word.forms = [...set];
      if (translations.length) {
        // дополняем переводы без дублей
        const tset = new Set(word.translations || []);
        for (const t of translations) tset.add(t);
        word.translations = [...tset].slice(0, 3);
      }
      updated++;
    }

    if (source) addSourceToItem(word, source);
  }

  return { added, updated };
}

// items: [{ text, translations }], source: id эпизода/главы
export function addPhrases(state, items, source) {
  let added = 0;
  let updated = 0;

  for (const it of items) {
    const text = String(it?.text ?? "").trim();
    if (!text) continue;

    let phrase = findPhraseByText(state, text);
    const translations = Array.isArray(it?.translations)
      ? it.translations.filter(Boolean).slice(0, 3)
      : [];

    if (!phrase) {
      phrase = makePhrase({ text, translations });
      state.phrases.push(phrase);
      added++;
    } else {
      if (translations.length) {
        const tset = new Set([...(phrase.translations || []), ...translations]);
        phrase.translations = [...tset].slice(0, 3);
      }
      updated++;
    }

    if (source) addSourceToItem(phrase, source);
  }

  return { added, updated };
}

// Привязка импорта к дереву shows/books → id эпизода/главы
/** Снимок лексики файла на эпизод/главу (перезаписывается при повторном разборе). */
export function setSourceVocabulary(state, sourceId, { words = [], phrases = [] } = {}) {
  if (!sourceId) return false;

  for (const show of state.shows || []) {
    for (const season of show.seasons || []) {
      for (const ep of season.episodes || []) {
        if (ep.id === sourceId) {
          ep.vocabulary = normalizeVocabulary({ words, phrases });
          return true;
        }
      }
    }
  }

  for (const book of state.books || []) {
    for (const ch of book.chapters || []) {
      if (ch.id === sourceId) {
        ch.vocabulary = normalizeVocabulary({ words, phrases });
        return true;
      }
    }
  }

  return false;
}

export function resolveImportSource(state, meta, fields) {
  if (meta.kind === "srt") {
    const showTitle = String(fields.show ?? "").trim();
    const seasonNum = Number(fields.season);
    const episodeNum = Number(fields.episode);
    const episodeTitle = String(fields.episodeTitle ?? "").trim();

    if (!showTitle || !seasonNum || !episodeNum) {
      const label = showTitle || (seasonNum && episodeNum
        ? `S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`
        : "—");
      return { sourceId: null, label };
    }

    const show = findOrCreateShow(state, showTitle);
    const season = findOrCreateSeason(show, seasonNum);
    const ep = findOrCreateEpisode(season, episodeNum, episodeTitle);
    const label = `S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`
      + (episodeTitle ? ` · ${episodeTitle}` : "");
    return { sourceId: ep.id, label };
  }

  const bookTitle = String(fields.book ?? "").trim();
  const chapterNum = Number(fields.chapter);
  const chapterTitle = String(fields.chapterTitle ?? "").trim();

  if (!bookTitle || !chapterNum) {
    return { sourceId: null, label: bookTitle || "—" };
  }

  const book = findOrCreateBook(state, bookTitle);
  const ch = findOrCreateChapter(book, chapterNum, chapterTitle);
  const label = `${bookTitle} · гл.${chapterNum}`
    + (chapterTitle ? ` · ${chapterTitle}` : "");
  return { sourceId: ch.id, label };
}

export function resolveSourceLabel(state, sourceId) {
  if (!sourceId) return "—";

  for (const show of state.shows || []) {
    for (const season of show.seasons || []) {
      for (const ep of season.episodes || []) {
        if (ep.id === sourceId) {
          const code = `S${String(season.number).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;
          return ep.title ? `${show.title} · ${code} · ${ep.title}` : `${show.title} · ${code}`;
        }
      }
    }
  }

  for (const book of state.books || []) {
    for (const ch of book.chapters || []) {
      if (ch.id === sourceId) {
        return ch.title
          ? `${book.title} · гл.${ch.number} · ${ch.title}`
          : `${book.title} · гл.${ch.number}`;
      }
    }
  }

  return sourceId;
}

/** Краткая метка для списка источников: «Сериал · S01E01» / «Книга · гл.3» */
export function formatSourceShort(state, sourceId) {
  if (!sourceId) return null;

  for (const show of state.shows || []) {
    for (const season of show.seasons || []) {
      for (const ep of season.episodes || []) {
        if (ep.id === sourceId) {
          const code = `S${String(season.number).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;
          return `${show.title} · ${code}`;
        }
      }
    }
  }

  for (const book of state.books || []) {
    for (const ch of book.chapters || []) {
      if (ch.id === sourceId) {
        return `${book.title} · гл.${ch.number}`;
      }
    }
  }

  return sourceId;
}

// ===================================================================
//  CRUD: СЛОВА И ВЫРАЖЕНИЯ (Этап 4)
// ===================================================================

export function findWordById(state, id) {
  return state.words.find((w) => w.id === id) || null;
}

export function findPhraseById(state, id) {
  return state.phrases.find((p) => p.id === id) || null;
}

export function addWordManual(state, { lemma, translations = [], sources = [], manual = true }) {
  const l = String(lemma ?? "").trim();
  if (!l) return null;
  const existing = findWordByLemma(state, l);
  if (existing) return existing;

  const word = makeWord({
    lemma: l,
    translations: translations.filter(Boolean).slice(0, 3),
    sources,
    manual,
  });
  state.words.push(word);
  return word;
}

export function addPhraseManual(state, { text, translations = [] }) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const existing = findPhraseByText(state, t);
  if (existing) return existing;

  const phrase = makePhrase({ text: t, translations: translations.filter(Boolean).slice(0, 3), manual: true });
  state.phrases.push(phrase);
  return phrase;
}

export function updateWord(state, id, patch) {
  const word = findWordById(state, id);
  if (!word) return null;
  if (patch.translations) word.translations = patch.translations.filter(Boolean).slice(0, 3);
  if (typeof patch.learned === "boolean") word.learned = patch.learned;
  return word;
}

export function updatePhrase(state, id, patch) {
  const phrase = findPhraseById(state, id);
  if (!phrase) return null;
  if (patch.translations) phrase.translations = patch.translations.filter(Boolean).slice(0, 3);
  if (typeof patch.learned === "boolean") phrase.learned = patch.learned;
  return phrase;
}

export function deleteWord(state, id) {
  const idx = state.words.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  const word = state.words[idx];
  addStopWord(state, word.lemma, word.translations || [], {
    sources: word.sources || [],
    manual: Boolean(word.manual),
  });
  state.words.splice(idx, 1);
  return true;
}

export function deletePhrase(state, id) {
  const idx = state.phrases.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  state.phrases.splice(idx, 1);
  return true;
}

export function markWordLearned(state, id) {
  const word = findWordById(state, id);
  if (!word) return false;
  word.learned = true;
  addKnownLemma(state, word.lemma);
  return true;
}

export function markPhraseLearned(state, id) {
  const phrase = findPhraseById(state, id);
  if (!phrase) return false;
  phrase.learned = true;
  const t = String(phrase.text).toLowerCase().trim();
  if (!state.knowledge) state.knowledge = { wordLemmas: [], phrases: [] };
  if (!state.knowledge.phrases.some((x) => String(x).toLowerCase() === t)) {
    state.knowledge.phrases.push(phrase.text);
  }
  return true;
}

export function unmarkWordLearned(state, id) {
  const word = findWordById(state, id);
  if (!word) return false;
  word.learned = false;
  removeKnownLemma(state, word.lemma);
  return true;
}

export function unmarkPhraseLearned(state, id) {
  const phrase = findPhraseById(state, id);
  if (!phrase) return false;
  phrase.learned = false;
  const t = String(phrase.text).toLowerCase().trim();
  state.knowledge.phrases = (state.knowledge?.phrases || []).filter(
    (x) => String(x).toLowerCase() !== t
  );
  return true;
}

export function addKnownPhrase(state, text) {
  const t = String(text).toLowerCase().trim();
  if (!t) return false;
  if (!state.knowledge) state.knowledge = { wordLemmas: [], phrases: [] };
  if (!Array.isArray(state.knowledge.phrases)) state.knowledge.phrases = [];
  if (state.knowledge.phrases.some((x) => String(x).toLowerCase() === t)) return false;
  state.knowledge.phrases.push(text.trim());
  return true;
}

export function removeKnownPhrase(state, text) {
  const t = String(text).toLowerCase().trim();
  const before = (state.knowledge?.phrases || []).length;
  state.knowledge.phrases = (state.knowledge?.phrases || []).filter(
    (x) => String(x).toLowerCase() !== t
  );
  return state.knowledge.phrases.length !== before;
}

// ===================================================================
//  БАЗА ЗНАНИЙ (Этап 7)
// ===================================================================

export function getStopListWords(state) {
  return (state.settings?.stopList || [])
    .map((entry) => {
      const { lemma, translations } = normalizeStopEntry(entry);
      const word = findWordByLemma(state, lemma);
      return {
        lemma,
        translations: translations.length ? translations : (word?.translations || []),
        word,
      };
    })
    .sort((a, b) => a.lemma.localeCompare(b.lemma));
}

export function returnStopWordToStudy(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l || !isStopWord(state, lemma)) return false;

  const stopEntry = (state.settings.stopList || []).find((x) => stopEntryLemma(x) === l);
  const saved = stopEntry ? normalizeStopEntry(stopEntry) : normalizeStopEntry("");

  removeStopWord(state, lemma);
  removeKnownLemma(state, lemma);

  const existing = findWordByLemma(state, lemma);
  if (existing) {
    existing.learned = false;
    existing.srs = emptySrs();
    if (saved.translations.length && !existing.translations?.length) {
      existing.translations = saved.translations;
    }
    if (saved.sources.length && !existing.sources?.length) {
      existing.sources = saved.sources;
      if (!saved.manual) existing.manual = false;
    }
  } else {
    addWordManual(state, {
      lemma: String(lemma).trim(),
      translations: saved.translations,
      sources: saved.sources,
      manual: saved.manual,
    });
  }
  return true;
}

export function getKnowledgeWords(state) {
  const map = new Map();

  for (const lemma of state.knowledge?.wordLemmas || []) {
    const l = String(lemma).toLowerCase().trim();
    if (!l || map.has(l)) continue;
    map.set(l, {
      lemma: String(lemma).trim(),
      word: findWordByLemma(state, lemma),
      inStopList: isStopWord(state, lemma),
    });
  }

  for (const w of state.words || []) {
    if (!w.learned) continue;
    const l = w.lemma.toLowerCase().trim();
    if (map.has(l)) continue;
    map.set(l, { lemma: w.lemma, word: w, inStopList: isStopWord(state, w.lemma) });
  }

  return [...map.values()].sort((a, b) => a.lemma.localeCompare(b.lemma));
}

export function getKnowledgePhrases(state) {
  const map = new Map();

  for (const text of state.knowledge?.phrases || []) {
    const t = String(text).toLowerCase().trim();
    if (!t || map.has(t)) continue;
    map.set(t, {
      text: String(text).trim(),
      phrase: findPhraseByText(state, text),
    });
  }

  for (const p of state.phrases || []) {
    if (!p.learned) continue;
    const t = p.text.toLowerCase().trim();
    if (map.has(t)) continue;
    map.set(t, { text: p.text, phrase: p });
  }

  return [...map.values()].sort((a, b) => a.text.localeCompare(b.text));
}

export function returnWordToStudy(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l) return false;
  removeKnownLemma(state, lemma);
  const word = findWordByLemma(state, lemma);
  if (word) {
    word.learned = false;
    word.srs = emptySrs();
  } else {
    addWordManual(state, { lemma: String(lemma).trim(), translations: [] });
  }
  return true;
}

export function returnPhraseToStudy(state, text) {
  const t = String(text).toLowerCase().trim();
  if (!t) return false;
  removeKnownPhrase(state, text);
  const phrase = findPhraseByText(state, text);
  if (phrase) {
    phrase.learned = false;
    phrase.srs = emptySrs();
  } else {
    addPhraseManual(state, { text: String(text).trim(), translations: [] });
  }
  return true;
}

export function excludeWordFromImport(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l) return false;
  const word = findWordByLemma(state, lemma);
  addStopWord(state, lemma, word?.translations || []);
  addKnownLemma(state, lemma);
  return true;
}

export function excludePhraseFromImport(state, text) {
  return addKnownPhrase(state, text);
}

// ===================================================================
//  НАСТРОЙКИ (Этап 8)
// ===================================================================

export function updateIntervals(state, intervals) {
  const nums = intervals.map((n) => Math.max(1, Math.round(Number(n) || 1))).slice(0, 5);
  while (nums.length < 5) nums.push(baseDefaultInterval(nums.length));
  state.settings.intervals = nums;
  return nums;
}

function baseDefaultInterval(i) {
  return [1, 3, 7, 16, 30][i] ?? 30;
}

export function recordSessionSummary(state, stats, prepLabel = null) {
  const entry = {
    date: new Date().toISOString(),
    total: stats.total || 0,
    correct: stats.correct || 0,
    wrong: stats.wrong || 0,
    prepLabel: prepLabel || null,
  };
  if (!state.settings) state.settings = emptyState().settings;
  state.settings.lastSession = entry;
  if (!Array.isArray(state.settings.sessionHistory)) state.settings.sessionHistory = [];
  state.settings.sessionHistory.unshift(entry);
  state.settings.sessionHistory = state.settings.sessionHistory.slice(0, 50);
  return entry;
}

export function getStepsToday(state) {
  const today = todayStr();
  return (state.settings?.sessionHistory || []).filter(
    (s) => String(s.date).slice(0, 10) === today
  );
}

export function getTodayTrainingSummary(state) {
  const steps = getStepsToday(state);
  const cards = steps.reduce((n, s) => n + (s.total || 0), 0);
  const correct = steps.reduce((n, s) => n + (s.correct || 0), 0);
  const wrong = steps.reduce((n, s) => n + (s.wrong || 0), 0);
  return {
    steps: steps.length,
    cards,
    correct,
    wrong,
    accuracy: cards ? Math.round((correct / cards) * 100) : 0,
  };
}

export function stepsInQueue(cardCount, stepSize = 10) {
  return Math.ceil(Math.max(0, cardCount) / stepSize);
}

export function stepsRemaining(cardCount, completedSteps, stepSize = 10) {
  const cardsLeft = Math.max(0, cardCount - completedSteps * stepSize);
  return Math.ceil(cardsLeft / stepSize);
}

export function hardResetState(state) {
  const fresh = emptyState();
  state.version = fresh.version;
  state.settings = fresh.settings;
  state.shows = fresh.shows;
  state.books = fresh.books;
  state.words = fresh.words;
  state.phrases = fresh.phrases;
  state.knowledge = fresh.knowledge;
  return state;
}

export function isTrainableItem(item) {
  return Boolean(item) && !item.learned && (item.translations || []).some(Boolean);
}

export function getAppStats(state) {
  const words = state.words || [];
  const phrases = state.phrases || [];
  const studyingWords = words.filter((w) => !w.learned);
  const studyingPhrases = phrases.filter((p) => !p.learned);
  return {
    words: words.length,
    phrases: phrases.length,
    learnedWords: words.filter((w) => w.learned).length,
    learnedPhrases: phrases.filter((p) => p.learned).length,
    studyingWords: studyingWords.length,
    studyingPhrases: studyingPhrases.length,
    noTransWords: studyingWords.filter((w) => !(w.translations || []).some(Boolean)).length,
    noTransPhrases: studyingPhrases.filter((p) => !(p.translations || []).some(Boolean)).length,
    activeWords: words.filter(isTrainableItem).length,
    activePhrases: phrases.filter(isTrainableItem).length,
    shows: (state.shows || []).length,
    books: (state.books || []).length,
  };
}

// ===================================================================
//  УПРАВЛЕНИЕ СТОП-ЛИСТОМ И БАЗОЙ ЗНАНИЙ (работают над state)
// ===================================================================

// --- Добавить лемму в стоп-лист («мусорка») ---
export function addStopWord(state, lemma, translations = [], meta = {}) {
  const trimmed = String(lemma).trim();
  const l = trimmed.toLowerCase();
  if (!l) return false;
  if (!Array.isArray(state.settings.stopList)) state.settings.stopList = [];

  const trans = Array.isArray(translations) ? translations.filter(Boolean).slice(0, 3) : [];
  const sources = Array.isArray(meta.sources) ? meta.sources.filter(Boolean) : [];
  const manual = Boolean(meta.manual);
  const idx = state.settings.stopList.findIndex((x) => stopEntryLemma(x) === l);

  if (idx >= 0) {
    const existing = normalizeStopEntry(state.settings.stopList[idx]);
    const entry = { ...existing, lemma: existing.lemma || trimmed };
    if (trans.length && !entry.translations.length) entry.translations = trans;
    if (sources.length && !entry.sources.length) entry.sources = sources;
    if (manual) entry.manual = true;
    state.settings.stopList[idx] = entry;
    return false;
  }

  state.settings.stopList.push({ lemma: trimmed, translations: trans, sources, manual });
  return true;
}

// --- Убрать лемму из стоп-листа (отмена) ---
export function removeStopWord(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  const before = state.settings.stopList.length;
  state.settings.stopList = state.settings.stopList.filter(
    (x) => stopEntryLemma(x) !== l
  );
  return state.settings.stopList.length !== before;
}

/** Удалить слово из всех коллекций (стоп-лист, карточки, база знаний). */
export function purgeWord(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l) return false;

  let changed = removeStopWord(state, lemma);
  changed = removeKnownLemma(state, lemma) || changed;

  const idx = state.words.findIndex((w) => w.lemma.toLowerCase().trim() === l);
  if (idx >= 0) {
    state.words.splice(idx, 1);
    changed = true;
  }

  return changed;
}

export function repairStopListTranslations(state, lookup) {
  if (typeof lookup !== "function") return false;
  let changed = false;

  state.settings.stopList = (state.settings.stopList || []).map((entry) => {
    const normalized = normalizeStopEntry(entry);
    if (normalized.translations.length || !normalized.lemma) return normalized;

    const fromDict = lookup(normalized.lemma);
    if (!fromDict?.length) return normalized;

    changed = true;
    return { lemma: normalized.lemma, translations: fromDict.slice(0, 3) };
  });

  return changed;
}

// --- Добавить лемму в Базу знаний («знаю») ---
export function addKnownLemma(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  if (!l) return false;
  if (!state.knowledge) state.knowledge = { wordLemmas: [], phrases: [] };
  if (!Array.isArray(state.knowledge.wordLemmas)) state.knowledge.wordLemmas = [];
  if (state.knowledge.wordLemmas.some((x) => String(x).toLowerCase() === l)) return false;
  state.knowledge.wordLemmas.push(l);
  return true;
}

/** «Знаю» при импорте — сохраняет карточку с переводами (не только лемму). */
export function addKnownWordFromImport(state, { lemma, translations = [], forms = [], sources = [], manual = false }) {
  const l = String(lemma ?? "").trim();
  if (!l) return null;

  addKnownLemma(state, l);
  const trans = (translations || []).filter(Boolean).slice(0, 3);
  let word = findWordByLemma(state, l);

  if (word) {
    word.learned = true;
    if (trans.length) word.translations = trans;
    if (forms?.length) {
      word.forms = [...new Set([...(word.forms || []), ...forms])];
    }
    if (manual) word.manual = true;
  } else {
    word = makeWord({ lemma: l, translations: trans, forms: forms || [], sources, manual });
    word.learned = true;
    state.words.push(word);
  }
  return word;
}

/** «Знаю» для выражения при импорте — сохраняет карточку с переводами. */
export function addKnownPhraseFromImport(state, { text, translations = [], sources = [] }) {
  const t = String(text ?? "").trim();
  if (!t) return null;

  addKnownPhrase(state, t);
  const trans = (translations || []).filter(Boolean).slice(0, 3);
  let phrase = findPhraseByText(state, t);

  if (phrase) {
    phrase.learned = true;
    if (trans.length) phrase.translations = trans;
  } else {
    phrase = makePhrase({ text: t, translations: trans, sources, manual: false });
    phrase.learned = true;
    state.phrases.push(phrase);
  }
  return phrase;
}

function repairKnowledgeWordCards(state) {
  let changed = false;

  for (const lemma of state.knowledge?.wordLemmas || []) {
    const l = String(lemma).trim();
    if (!l || findWordByLemma(state, l)) continue;
    const word = makeWord({ lemma: l, translations: [], sources: [] });
    word.learned = true;
    state.words.push(word);
    changed = true;
  }

  for (const text of state.knowledge?.phrases || []) {
    const t = String(text).trim();
    if (!t || findPhraseByText(state, t)) continue;
    const phrase = makePhrase({ text: t, translations: [], sources: [], manual: false });
    phrase.learned = true;
    state.phrases.push(phrase);
    changed = true;
  }

  return changed;
}

// --- Убрать лемму из Базы знаний (отмена) ---
export function removeKnownLemma(state, lemma) {
  const l = String(lemma).toLowerCase().trim();
  const before = state.knowledge.wordLemmas.length;
  state.knowledge.wordLemmas = state.knowledge.wordLemmas.filter(
    (x) => String(x).toLowerCase() !== l
  );
  return state.knowledge.wordLemmas.length !== before;
}