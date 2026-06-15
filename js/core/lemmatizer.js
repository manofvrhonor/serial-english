// ===== Токенизация + поиск леммы по индексу форм =====
// Без обрезки суффиксов: форма → лемма из заранее построенного словаря.

const CONTRACTIONS = {
  "i'm": ["i", "am"],
  "you're": ["you", "are"],
  "we're": ["we", "are"],
  "they're": ["they", "are"],
  "he's": ["he", "is"],
  "she's": ["she", "is"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "there's": ["there", "is"],
  "what's": ["what", "is"],
  "who's": ["who", "is"],
  "where's": ["where", "is"],
  "how's": ["how", "is"],
  "here's": ["here", "is"],
  "let's": ["let", "us"],
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "won't": ["will", "not"],
  "can't": ["can", "not"],
  "couldn't": ["could", "not"],
  "wouldn't": ["would", "not"],
  "shouldn't": ["should", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "weren't": ["were", "not"],
  "haven't": ["have", "not"],
  "hasn't": ["has", "not"],
  "hadn't": ["had", "not"],
  "i'll": ["i", "will"],
  "you'll": ["you", "will"],
  "he'll": ["he", "will"],
  "she'll": ["she", "will"],
  "we'll": ["we", "will"],
  "they'll": ["they", "will"],
  "i've": ["i", "have"],
  "you've": ["you", "have"],
  "we've": ["we", "have"],
  "they've": ["they", "have"],
  "i'd": ["i", "would"],
  "you'd": ["you", "would"],
  "he'd": ["he", "would"],
  "she'd": ["she", "would"],
  "we'd": ["we", "would"],
  "they'd": ["they", "would"],
};

function expandToken(token) {
  const t = token.toLowerCase();
  return CONTRACTIONS[t] || [t];
}

export function tokenize(text) {
  const raw = String(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const out = [];
  for (const tok of raw) {
    out.push(...expandToken(tok));
  }
  return out;
}

export function resolveLemma(word, dict, formsIndex) {
  const w = String(word).toLowerCase().trim();
  if (!w) return "";

  if (formsIndex?.[w]) return formsIndex[w];
  if (dict?.[w]) return w;

  return w;
}

export function lemmatize(word) {
  return String(word).toLowerCase().trim();
}

export function lemmatizeWithDict(word, dict, formsIndex = null) {
  return resolveLemma(word, dict, formsIndex);
}
