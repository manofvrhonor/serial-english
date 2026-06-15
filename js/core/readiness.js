// ===== Готовность источника (серия / глава) =====

export function getWordsForSource(state, sourceId) {
  return (state.words || []).filter((w) => (w.sources || []).includes(sourceId));
}

export function getPhrasesForSource(state, sourceId) {
  return (state.phrases || []).filter((p) => (p.sources || []).includes(sourceId));
}

export function calcReadiness(state, sourceId) {
  const items = [...getWordsForSource(state, sourceId), ...getPhrasesForSource(state, sourceId)];
  const total = items.length;
  const learned = items.filter((x) => x.learned).length;
  const percent = total ? Math.round((learned / total) * 100) : 0;
  return { total, learned, percent, unlearned: total - learned };
}

export function calcReadinessForSources(state, sourceIds) {
  const seen = new Set();
  let total = 0;
  let learned = 0;

  for (const sid of sourceIds) {
    const items = [...getWordsForSource(state, sid), ...getPhrasesForSource(state, sid)];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      total++;
      if (item.learned) learned++;
    }
  }

  const percent = total ? Math.round((learned / total) * 100) : 0;
  return { total, learned, percent, unlearned: total - learned };
}

export function progressBarHtml(readiness, compact = false) {
  const { total, learned, percent } = readiness;
  if (total === 0) {
    return `<span class="prog-empty">${compact ? "—" : "нет слов"}</span>`;
  }
  return `
    <div class="prog-wrap${compact ? " prog-compact" : ""}">
      <div class="prog-bar" title="${learned} из ${total} (${percent}%)">
        <div class="prog-fill" style="width:${percent}%"></div>
      </div>
      <span class="prog-text">${learned}/${total}</span>
    </div>`;
}

export function episodeLabel(season, ep) {
  const code = `S${String(season.number).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;
  return ep.title ? `${code} · ${ep.title}` : code;
}

export function chapterLabel(ch) {
  return ch.title ? `Глава ${ch.number} · ${ch.title}` : `Глава ${ch.number}`;
}
