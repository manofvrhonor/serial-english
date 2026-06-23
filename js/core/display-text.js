/** Заглавная буква в начале каждого слова (только для отображения в UI). */
export function titleCase(text) {
  const s = String(text ?? "").trim();
  if (!s) return s;
  return s.replace(/(^|[\s·\-–—/(,;])(\p{Ll})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export function titleCaseList(items, separator = ", ") {
  return (items || []).filter(Boolean).map(titleCase).join(separator);
}
