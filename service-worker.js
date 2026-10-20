const VOCABULARY_FILE = 'vocabulary.csv';
const GRAMMAR_FILE = 'grammar.csv';

async function loadCsvFile(file) {
  const response = await fetch(chrome.runtime.getURL(file));
  if (!response.ok) throw new Error(`Could not load ${file}`);
  return response.text();
}

function parseVocabulary(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const comma = line.indexOf(',');
    if (comma === -1) continue;
    const italian = line.slice(0, comma).trim();
    const english = line.slice(comma + 1).trim();
    if (italian && english) entries.push({ italian, english });
  }
  return entries;
}

function parseGrammar(text) {
  const [headerLine, ...lines] = text.split(/\r?\n/);
  if (!headerLine) return [];
  const headers = headerLine.split(',').map(x => x.trim());
  return lines.filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((key, i) => [key, (values[i] || '').trim()]));
  }).filter(row => row.english && row.italian && row.partOfSpeech);
}

function buildReplacements(entries) {
  const replacements = {};
  // Duplicate rows stay in the vocabulary list/export. First row wins at runtime.
  for (const { italian, english } of entries) {
    const key = english.toLocaleLowerCase();
    if (!(key in replacements)) replacements[key] = italian;
  }
  return replacements;
}

async function getState() {
  const [vocabularyText, grammarText] = await Promise.all([
    loadCsvFile(VOCABULARY_FILE), loadCsvFile(GRAMMAR_FILE)
  ]);
  const bundledEntries = parseVocabulary(vocabularyText);
  const grammarEntries = parseGrammar(grammarText);
  const stored = await chrome.storage.local.get({
    enabled: true,
    addedEntries: [],
    added: {},
    highlightMode: false
  });

  let addedEntries = Array.isArray(stored.addedEntries) ? stored.addedEntries : [];
  if (!addedEntries.length && stored.added && typeof stored.added === 'object') {
    addedEntries = Object.entries(stored.added).map(([english, italian]) => ({ italian, english }));
  }

  const allEntries = [...bundledEntries, ...addedEntries];
  return {
    enabled: Boolean(stored.enabled),
    highlightMode: Boolean(stored.highlightMode),
    bundledEntries,
    addedEntries,
    allEntries,
    replacements: buildReplacements(allEntries),
    grammarEntries
  };
}

async function pushStateToTabs() {
  const state = await getState();
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async tab => {
    if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'settings-updated', enabled: state.enabled,
        highlightMode: state.highlightMode,
        replacements: state.replacements,
        grammarEntries: state.grammarEntries
      });
    } catch (_) {}
  }));
}

chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ enabled: true, addedEntries: [], highlightMode: false });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getState().then(sendResponse).catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === 'settings-changed') {
    pushStateToTabs().then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
