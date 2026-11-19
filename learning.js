(() => {
  // Shared pure functions: usable in the worker, panel and Node tests.
  function parseCsv(text) {
    const rows = []; let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
        row.push(field); field = '';
        if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
      } else field += c;
    }
    if (quoted) throw new Error('Unclosed quote in CSV');
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter(row => row.some(Boolean) && !row[0].startsWith('#'));
  }
  const entryId = entry => JSON.stringify([entry.italian, entry.english]);
  const cards = entries => [...new Map(entries.map(e => [entryId(e), { ...e, id: entryId(e) }])).values()];
  const intervals = [1, 3, 7, 14, 30, 60];
  function review(previous, outcome, now = Date.now()) {
    if (!['again', 'known'].includes(outcome)) throw new Error('Invalid review outcome');
    const step = outcome === 'again' ? -1 : Math.min((previous?.step ?? -1) + 1, intervals.length - 1);
    return { step, due: now + (step < 0 ? 10 * 60 * 1000 : intervals[step] * 86400000),
      reviewedAt: now, reviews: (previous?.reviews || 0) + 1 };
  }
  const csvField = value => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  globalThis.ScambioLearning = { parseCsv, entryId, cards, review, csvField };
})();
