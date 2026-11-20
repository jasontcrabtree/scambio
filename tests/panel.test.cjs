const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const settle = () => new Promise(resolve => setImmediate(resolve));
test('panel defaults to page, preserves revealed answers, follows tabs and handles missing scripts', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: id === 'mode' ? 'page' : '', hidden: true, focus() {} });
    return elements.get(id);
  };
  let activeTab = 1, activate, poll;
  const snapshots = { 1: { pageKey: 'one', english: ['city'], enabled: true }, 2: { pageKey: 'two', english: ['guitar'], enabled: true } };
  const data = { cards: [
    { id: 'city', english: 'city', italian: 'città' },
    { id: 'guitar', english: 'guitar', italian: 'chitarra' },
    { id: 'other', english: 'other', italian: 'altro' }
  ], reviews: {}, domains: {}, encounteredWords: {}, grammarEntries: [], trackDomains: false };
  const context = vm.createContext({ document: { getElementById: get }, console,
    setInterval: callback => { poll = callback; },
    chrome: {
      runtime: { sendMessage: async () => structuredClone(data) },
      windows: { getCurrent: async () => ({ id: 10 }) },
      tabs: {
        query: async () => [{ id: activeTab }],
        sendMessage: async id => { if (!snapshots[id]) throw Error('No script'); return snapshots[id]; },
        onActivated: { addListener: cb => { activate = cb; } }, onUpdated: { addListener() {} }
      }
    }
  });
  vm.runInContext(fs.readFileSync('learning.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('sidepanel.js', 'utf8'), context);
  await settle();
  assert.equal(get('prompt').textContent, 'city');
  assert.match(get('summary').textContent, /1 words on this page/);
  get('reveal').onclick(); poll(); await settle();
  assert.equal(get('answer').hidden, false);
  activeTab = 2; activate({ windowId: 10 });
  assert.notEqual(get('prompt').textContent, 'city');
  await settle();
  assert.equal(get('prompt').textContent, 'guitar');
  assert.equal(get('answer').hidden, true);
  snapshots[2].english = []; poll(); await settle();
  assert.equal(get('reveal').hidden, true);
  activeTab = 3; activate({ windowId: 10 }); await settle();
  assert.match(get('context').textContent, /unavailable/);
  get('mode').value = 'all'; get('mode').onchange();
  assert.equal(get('prompt').textContent, 'city');
  assert.match(get('summary').textContent, /3 eligible cards/);
  get('mode').value = 'due'; get('mode').onchange();
  assert.equal(get('reveal').hidden, true);
});
