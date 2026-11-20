importScripts('learning.js');
const VOCABULARY_FILE = 'vocabulary.csv';
const GRAMMAR_FILE = 'grammar.csv';

async function loadCsvFile(file) {
  const response = await fetch(chrome.runtime.getURL(file));
  if (!response.ok) throw new Error(`Could not load ${file}`);
  return response.text();
}

function parseVocabulary(text) {
  return ScambioLearning.parseCsv(text).filter(row => row.length === 2 && row.every(s => s.trim()))
    .map(([italian, english]) => ({ italian, english }));
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
  const replacements = Object.create(null);
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
    highlightMode: false,
    trackDomains: false
  });

  let addedEntries = Array.isArray(stored.addedEntries) ? stored.addedEntries : [];
  if (!addedEntries.length && stored.added && typeof stored.added === 'object') {
    addedEntries = Object.entries(stored.added).map(([english, italian]) => ({ italian, english }));
  }

  const allEntries = [...bundledEntries, ...addedEntries];
  return {
    enabled: Boolean(stored.enabled),
    highlightMode: Boolean(stored.highlightMode),
    trackDomains: Boolean(stored.trackDomains),
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
        trackDomains: state.trackDomains,
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

// Serialize read/modify/write operations so simultaneous tabs cannot lose reviews/history.
let learningWrites = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['learning-state', 'review', 'encounter', 'clear-domains'].includes(message?.type)) return;
  const task = async () => {
    const state = await getState();
    const cards = ScambioLearning.cards(state.allEntries);
    const saved = await chrome.storage.local.get({ reviews: {}, domains: {}, encounteredWords: {} });
    // Preserve eligibility from optional history recorded before encounteredWords existed.
    let migrated = false;
    for (const domain of Object.values(saved.domains)) for (const [id, seen] of Object.entries(domain.words)) {
      if (!saved.encounteredWords[id]) { saved.encounteredWords[id] = seen; migrated = true; }
    }
    if (migrated) await chrome.storage.local.set({ encounteredWords: saved.encounteredWords });
    const internal = !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(''));
    if (message.type === 'learning-state') {
      if (!internal) throw new Error('Extension page required');
      return { ...saved, cards, trackDomains: state.trackDomains, grammarEntries: state.grammarEntries };
    }
    if (message.type === 'review') {
      if (!internal || !cards.some(c => c.id === message.id)) throw new Error('Unknown card');
      saved.reviews[message.id] = ScambioLearning.review(saved.reviews[message.id], message.outcome);
      await chrome.storage.local.set({ reviews: saved.reviews });
    }
    if (message.type === 'clear-domains') {
      if (!internal) throw new Error('Extension page required');
      await chrome.storage.local.set({ domains: {} });
    }
    if (message.type === 'encounter' && state.enabled && sender.tab && !sender.tab.incognito && sender.frameId === 0) {
      const url = new URL(sender.url);
      if (!['http:', 'https:'].includes(url.protocol)) return { ok: true };
      const domain = url.hostname;
      const key = JSON.stringify(domain);
      const record = saved.domains[key] || { hostname: domain, words: {}, lastSeen: 0 };
      const requested = new Set(Array.isArray(message.english) ? message.english.slice(0, 1000) : []);
      const now = Date.now();
      for (const card of cards) {
        if (requested.has(card.english.toLocaleLowerCase()) && state.replacements[card.english.toLocaleLowerCase()] === card.italian) {
          record.words[card.id] = now;
          saved.encounteredWords[card.id] = now;
        }
      }
      if (!Object.keys(record.words).length) return { ok: true };
      await chrome.storage.local.set({ encounteredWords: saved.encounteredWords });
      if (!state.trackDomains) return { ok: true };
      record.lastSeen = now;
      saved.domains[key] = record;
      // Bounded history: keep the 50 most recently encountered hostnames.
      const domains = Object.fromEntries(Object.entries(saved.domains).sort((a, b) => b[1].lastSeen - a[1].lastSeen).slice(0, 50));
      await chrome.storage.local.set({ domains });
    }
    return { ok: true };
  };
  learningWrites = learningWrites.then(task, task);
  learningWrites.then(sendResponse, error => sendResponse({ error: error.message }));
  return true;
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
