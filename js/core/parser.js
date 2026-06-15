// ===== Парсинг файлов и разбор имени (логика без UI) =====

// ---------- Парсинг .srt → чистый текст ----------
// Убирает порядковые номера, таймкоды (00:00:01,000 --> 00:00:04,000),
// html-теги (<i>, <b>), фигурные теги {\an8}, лишние пробелы.
export function parseSrt(raw) {
  const text = String(raw)
    .replace(/\r/g, "")                       // нормализуем переносы
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t === "") return false;             // пустые строки
      if (/^\d+$/.test(t)) return false;      // строка-номер субтитра
      if (/-->/.test(t)) return false;        // строка с таймкодом
      return true;
    })
    .join(" ");

  return cleanText(text);
}

// ---------- Парсинг .txt → чистый текст ----------
export function parseTxt(raw) {
  const text = String(raw).replace(/\r/g, "").replace(/\n+/g, " ");
  return cleanText(text);
}

// ---------- Общая очистка текста ----------
function cleanText(text) {
  return text
    .replace(/<\/?[^>]+>/g, " ")              // html-теги <i> </i> <b>
    .replace(/\{[^}]*\}/g, " ")               // фигурные теги {\an8}
    .replace(/\s+/g, " ")                     // схлопываем пробелы
    .trim();
}

// ---------- Парсинг в зависимости от типа ----------
// type: "srt" | "txt"
export function parseFileContent(raw, type) {
  if (type === "srt") return parseSrt(raw);
  if (type === "txt") return parseTxt(raw);
  return cleanText(String(raw));
}

// ===================================================================
//  Разбор имени файла → метки источника
// ===================================================================
// Возвращает объект-подсказку. Пользователь сможет поправить вручную.
//
// Для .srt:  { kind:"srt", show, season, episode, episodeTitle }
// Для .txt:  { kind:"txt", book, chapter, chapterTitle }
//
// Если что-то не распозналось — поле null/"" (заполнит пользователь).
export function parseFileName(fileName) {
  const name = String(fileName).replace(/\.[^.]+$/, "").trim(); // убрать расширение
  const ext = (String(fileName).match(/\.([^.]+)$/)?.[1] || "").toLowerCase();

  if (ext === "srt") return parseShowName(name);
  if (ext === "txt") return parseBookName(name);

  return { kind: "unknown", raw: name };
}

// --- Имя серии: ищем S01E07 / 1x07 и т.п. ---
function parseShowName(name) {
  let show = "";
  let season = null;
  let episode = null;
  let episodeTitle = "";

  // Формат S01E07 (регистр любой)
  let m = name.match(/S(\d{1,2})\s*E(\d{1,2})/i);
  if (m) {
    season = parseInt(m[1], 10);
    episode = parseInt(m[2], 10);
  } else {
    // Формат 1x07
    m = name.match(/(\d{1,2})\s*x\s*(\d{1,2})/i);
    if (m) {
      season = parseInt(m[1], 10);
      episode = parseInt(m[2], 10);
    }
  }

  if (m) {
    // всё ДО метки сезона/серии считаем названием сериала
    show = name.slice(0, m.index).replace(/[._\-]+/g, " ").trim();
    // всё ПОСЛЕ метки — это название серии
    episodeTitle = name
      .slice(m.index + m[0].length)
      .replace(/[._\-]+/g, " ")
      .trim();
  } else {
    // метку не нашли — всё имя как название сериала
    show = name.replace(/[._\-]+/g, " ").trim();
  }

  return {
    kind: "srt",
    show,
    season,
    episode,
    episodeTitle,
  };
}

// --- Имя главы: ищем Chapter 1 / Глава 1 / Ch01 ---
function parseBookName(name) {
  let book = "";
  let chapter = null;
  let chapterTitle = "";

  // Chapter 1 / Ch 01 / Глава 1
  let m = name.match(/(?:chapter|ch|глава|гл)\s*[._\-]?\s*(\d{1,3})/i);
  if (m) {
    chapter = parseInt(m[1], 10);
    book = name.slice(0, m.index).replace(/[._\-]+/g, " ").trim();
    chapterTitle = name
      .slice(m.index + m[0].length)
      .replace(/[._\-]+/g, " ")
      .trim();
  } else {
    book = name.replace(/[._\-]+/g, " ").trim();
  }

  return {
    kind: "txt",
    book,
    chapter,
    chapterTitle,
  };
}