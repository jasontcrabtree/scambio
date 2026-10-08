const VOCABULARY_FILE = 'vocabulary.csv';

async function loadBundledVocabulary() {
  const response = await fetch(chrome.runtime.getURL(VOCABULARY_FILE));
  if (!response.ok) throw new Error(`Could not load ${VOCABULARY_FILE}`);
  return parseVocabulary(await response.text());
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

function buildReplacements(entries) {
  const replacements = {};
  // One English phrase can have multiple CSV rows. Keep the first row as the
  // runtime replacement, while retaining every row in the CSV/UI/export.
  for (const { italian, english } of entries) {
    const key = english.toLocaleLowerCase();
    if (!(key in replacements)) replacements[key] = italian;
  }
  return replacements;
}

async function getState() {
  const bundledEntries = await loadBundledVocabulary();
  const stored = await chrome.storage.local.get({
    enabled: true,
    addedEntries: [],
    // Compatibility with 2.1's object-based additions.
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
    replacements: buildReplacements(allEntries)
  };
}

async function pushStateToTabs() {
  const state = await getState();
  const tabs = await chrome.tabs.query({});

  await Promise.all(tabs.map(async tab => {
    if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'settings-updated',
        enabled: state.enabled,
        highlightMode: state.highlightMode,
        replacements: state.replacements
      });
    } catch (_) {}
  }));
}

chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      enabled: true,
      addedEntries: [],
      highlightMode: false
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getState().then(sendResponse).catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === 'settings-changed') {
    pushStateToTabs()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
