/**
 * Сборка офлайн-словаря EN→RU (топ-30k по частоте из субтитров).
 * Запуск: node scripts/build-dictionary.mjs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFormsIndex } from "../js/core/inflections.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TARGET_COUNT = 30_000;
const MAX_TRANSLATIONS = 3;

const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt";
const ENG_RUS_URL =
  "https://raw.githubusercontent.com/spishniak/rus-eng-eng-rus-txt-json/master/eng-rus.json";
const IUZHAKOV_URL =
  "https://raw.githubusercontent.com/iuzhakov/English-Russian-vocabulary/master/words.json";

// Приоритет источника (чем выше — тем важнее для топ-1).
const SOURCE_WEIGHT = {
  override: 100,
  iuzhakov: 85,
  seed: 75,
  spishniak: 30,
};

// Слова/паттерны, которые понижаем (архаизмы, редкие, кривые формы).
const RU_PENALTY = [
  /^горище$/i, /^аттический$/i, /^койк/i, /^койка$/i, /^дивить$/i, /^лещадь$/i, /^затеять$/i,
  /^гулять$/i, /^отведывать$/i, /^занимател/i, /^забавлять$/i,
  /^интересен$/i, /^занятно$/i, /^пытался$/i,
  /\(от /i, /^начался$/i, /^начинал/i, /!new!/i, /[!()]/,
];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  return res.text();
}

function normalizeRu(text) {
  let t = String(text).trim().replace(/\s+/g, " ");
  // убираем мусор из spishniak: "(!NEW!)", "(от begin)"
  t = t.replace(/\s*[!()].*$/g, "").trim();
  if (!t) return "";
  if (t === t.toUpperCase() && /[А-ЯЁ]/.test(t)) {
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t;
}

// Падежная форма относительно другой (койку ← койка).
function isInflectedForm(ru, others) {
  const l = ru.toLowerCase();
  for (const o of others) {
    const ol = o.toLowerCase();
    if (l === ol) continue;
    // койку / койка, землю / земля
    if (l.length === ol.length + 1 && l.startsWith(ol.slice(0, -1))) return true;
    if (ol.length === l.length + 1 && ol.startsWith(l.slice(0, -1))) return true;
    if (l.length >= 4 && ol.length >= 4 && l.slice(0, -1) === ol.slice(0, -1)) return true;
  }
  return false;
}

function scoreRuTranslation(ru, sourceWeight) {
  let score = sourceWeight;
  const l = ru.toLowerCase();
  if (l.length >= 4 && l.length <= 14) score += 8;
  if (l.length > 18) score -= 15;
  if (/[ъё]{2,}/.test(l)) score -= 5;
  for (const p of RU_PENALTY) {
    if (p.test(ru)) score -= 40;
  }
  return score;
}

function scoreRuForLemma(ru, lemma, sourceWeight) {
  let score = scoreRuTranslation(ru, sourceWeight);
  const ll = String(lemma).toLowerCase();
  const rl = ru.toLowerCase();

  if (/(?:ity|ness|tion|ment|ism|ship|hood|ence|ance)$/.test(ll)) {
    if (/(?:ость|ство|ция|ние|изм|ание|ение|ация|енность)$/.test(rl)) score += 30;
    if (/(?:ый|ий|ой|ая|яя)$/.test(rl)) score -= 12;
    if (/^(?:серьёз|серьез|важн|опасн)/.test(rl) && /(?:ity|ness)$/.test(ll)) score -= 30;
  }

  if (ll.endsWith("ing")) {
    if (/(?:ый|ий|ая|яя|щий|ющий)$/.test(rl)) score += 15;
  }

  if (ll.length >= 4 && rl.length >= 4) {
    if (ll.includes("grav") && rl.includes("грав")) score += 45;
    if (ll.endsWith("tion") && rl.endsWith("ция")) score += 35;
    if (ll.endsWith("sion") && rl.endsWith("ция")) score += 35;
    if (ll.endsWith("ity") && /(?:ность|ость)$/.test(rl)) score += 25;
    if (ll.endsWith("ness") && /(?:ность|ость)$/.test(rl)) score += 25;
  }

  return score;
}

function ruKey(ru) {
  return ru.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, "").trim();
}

function finalizeTranslations(entries, lemma) {
  const sorted = [...entries]
    .map((e) => ({ ru: e.ru, weight: scoreRuForLemma(e.ru, lemma, e.src ?? e.w ?? 0) }))
    .sort((a, b) => b.weight - a.weight);
  const out = [];
  const seen = new Set();
  for (const { ru } of sorted) {
    if (!ru) continue;
    const key = ruKey(ru);
    if (!key || seen.has(key)) continue;
    if (isInflectedForm(ru, out)) continue;
    seen.add(key);
    out.push(ru);
    if (out.length >= MAX_TRANSLATIONS) break;
  }
  return out;
}

function isLemma(word) {
  return /^[a-z]+(?:'[a-z]+)?$/.test(word);
}

async function loadJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// bucket: lemma → [{ ru, weight }]
function addToBucket(bucket, lemma, translations, source) {
  const k = lemma.toLowerCase();
  if (!bucket.has(k)) bucket.set(k, []);
  const weight = SOURCE_WEIGHT[source] ?? 10;
  const list = bucket.get(k);
  for (const raw of translations) {
    const ru = normalizeRu(raw);
    if (!ru) continue;
    list.push({ ru, src: weight, w: scoreRuTranslation(ru, weight) });
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("Загрузка частотного списка…");
  const freqText = await download(FREQ_URL);
  const freqWords = [];
  for (const line of freqText.split("\n")) {
    const word = line.trim().split(/\s+/)[0]?.toLowerCase();
    if (!word || !isLemma(word)) continue;
    freqWords.push(word);
  }
  console.log(`Частотных лемм (всего): ${freqWords.length}`);

  const bucket = new Map();

  // 1. iuzhakov — учебный словарь
  console.log("Загрузка iuzhakov…");
  const iuzhakov = JSON.parse(await download(IUZHAKOV_URL));
  for (const row of iuzhakov) {
    if (row?.en && row?.ru) {
      const parts = String(row.ru).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      addToBucket(bucket, row.en, parts.length ? parts : [row.ru], "iuzhakov");
    }
  }

  // 2. seed (если есть)
  const seed = await loadJson(join(DATA_DIR, "dictionary.seed.json"));
  for (const [lemma, trans] of Object.entries(seed)) {
    addToBucket(bucket, lemma, trans, "seed");
  }

  // 3. spishniak — большой, но с мусором; низкий приоритет
  console.log("Загрузка spishniak…");
  const engRus = JSON.parse(await download(ENG_RUS_URL));
  for (const [key, vals] of Object.entries(engRus)) {
    addToBucket(bucket, key, vals, "spishniak");
  }

  // 4. Ручные override — ПОСЛЕДНИМИ, полностью заменяют переводы слова
  const overrides = await loadJson(join(DATA_DIR, "translation-overrides.json"));
  for (const [lemma, trans] of Object.entries(overrides)) {
    const k = lemma.toLowerCase();
    bucket.set(
      k,
      trans.map((ru) => ({
        ru: normalizeRu(ru),
        weight: scoreRuTranslation(normalizeRu(ru), SOURCE_WEIGHT.override + 50),
      })).filter((x) => x.ru),
    );
  }
  console.log(`Overrides: ${Object.keys(overrides).length}`);

  // Финализируем переводы
  const lookup = new Map();
  for (const [lemma, entries] of bucket) {
    const final = finalizeTranslations(entries, lemma);
    if (final.length) lookup.set(lemma, final);
  }
  console.log(`Записей в индексе: ${lookup.size}`);

  // Нормализация: decided→decide, getting→get, began→begin
  const preForms = buildFormsIndex([...lookup.keys()]);

  const result = {};
  let scanned = 0;
  let skipped = 0;

  for (const word of freqWords) {
    scanned++;
    const lemma = preForms[word] || word;
    if (result[lemma]) continue;

    const trans = lookup.get(lemma);
    if (!trans?.length) {
      skipped++;
      continue;
    }
    result[lemma] = trans;
    if (Object.keys(result).length >= TARGET_COUNT) break;
  }

  const jsonPath = join(DATA_DIR, "dictionary.json");
  const dictGzPath = join(DATA_DIR, "dictionary.json.gz");
  const formsPath = join(DATA_DIR, "forms.json");
  const formsGzPath = join(DATA_DIR, "forms.json.gz");

  await writeFile(jsonPath, JSON.stringify(result), "utf8");
  await pipeline(createReadStream(jsonPath), createGzip({ level: 9 }), createWriteStream(dictGzPath));

  const formsIndex = buildFormsIndex(Object.keys(result));
  await writeFile(formsPath, JSON.stringify(formsIndex), "utf8");
  await pipeline(createReadStream(formsPath), createGzip({ level: 9 }), createWriteStream(formsGzPath));

  const { size: jsonSize } = await import("node:fs/promises").then((fs) => fs.stat(jsonPath));
  const { size: gzSize } = await import("node:fs/promises").then((fs) => fs.stat(dictGzPath));
  const { size: formsGzSize } = await import("node:fs/promises").then((fs) => fs.stat(formsGzPath));

  const count = Object.keys(result).length;
  console.log("\nГотово:");
  console.log(`  Слов в словаре: ${count}`);
  console.log(`  Форм в индексе: ${Object.keys(formsIndex).length}`);
  console.log(`  Просмотрено по частоте: ${scanned}`);
  console.log(`  Пропущено без перевода: ${skipped}`);
  console.log(`  dictionary.json.gz: ${(gzSize / 1024).toFixed(0)} КБ`);
  console.log(`  forms.json.gz: ${(formsGzSize / 1024).toFixed(0)} КБ`);

  for (const w of ["decide", "decided", "getting", "nothing", "gravity", "let", "get"]) {
    const lemma = formsIndex[w] || w;
    console.log(`  ${w} → ${lemma}: ${(result[lemma] || result[w] || []).join(", ") || "—"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
