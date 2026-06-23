// ===== Ленивая загрузка офлайн-словаря EN→RU + индекс форм =====

let _dict = null;
let _forms = null;
let _loading = null;

const DICT_GZ = "./data/dictionary.json.gz";
const DICT_JSON = "./data/dictionary.json";
const FORMS_GZ = "./data/forms.json.gz";
const FORMS_JSON = "./data/forms.json";

async function parseDictionaryResponse(res) {
  const encoding = res.headers.get("Content-Encoding") || "";
  const url = res.url || "";

  if (encoding.includes("gzip") && typeof DecompressionStream !== "undefined") {
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  if (url.includes(".gz") && typeof DecompressionStream !== "undefined") {
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  return res.json();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить (${url})`);
  return parseDictionaryResponse(res);
}

async function loadForms() {
  try {
    return await fetchJson(FORMS_GZ);
  } catch {
    try {
      return await fetchJson(FORMS_JSON);
    } catch {
      console.warn("Индекс форм не загружен");
      return {};
    }
  }
}

export async function getDictionary() {
  if (_dict) return _dict;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      _dict = await fetchJson(DICT_GZ);
    } catch {
      try {
        _dict = await fetchJson(DICT_JSON);
      } catch {
        console.warn("Словарь не загружен");
        _dict = {};
      }
    }
    _forms = await loadForms();
    _loading = null;
    return _dict;
  })();

  return _loading;
}

export function getFormsIndex() {
  return _forms || {};
}

/** Сколько переводов подставляем из офлайн-словаря при импорте и материализации */
export const SUGGEST_TRANS_LIMIT = 2;

export function translate(lemma, dict) {
  if (!dict || !lemma) return [];
  const key = String(lemma).toLowerCase().trim();
  return Array.isArray(dict[key]) ? dict[key].slice(0, SUGGEST_TRANS_LIMIT) : [];
}

export function lookupAll(lemma, dict) {
  if (!dict || !lemma) return [];
  const key = String(lemma).toLowerCase().trim();
  return Array.isArray(dict[key]) ? [...dict[key]] : [];
}

export function translatorUrl(word) {
  const q = encodeURIComponent(word);
  return `https://translate.google.com/?sl=en&tl=ru&text=${q}&op=translate`;
}
