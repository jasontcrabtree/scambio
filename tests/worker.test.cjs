const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const values = { trackDomains: true }, listeners = [];
  const context = vm.createContext({ URL, console, setTimeout,
    fetch: async file => ({ ok: true, text: async () => fs.readFileSync(file.replace('chrome-extension://test/', ''), 'utf8') }),
    chrome: {
      runtime: { getURL: path => `chrome-extension://test/${path}`, onInstalled: { addListener() {} }, onMessage: { addListener: cb => listeners.push(cb) } },
      tabs: { query: async () => [], sendMessage: async () => {} },
      storage: { local: {
        get: async defaults => structuredClone({ ...defaults, ...values }),
        set: async next => { Object.assign(values, structuredClone(next)); }
      } }
    }
  });
  context.importScripts = path => vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  vm.runInContext(fs.readFileSync('service-worker.js', 'utf8'), context);
  const panel = { url: 'chrome-extension://test/sidepanel.html' };
  const send = (message, sender = panel) => new Promise(resolve => listeners.forEach(cb => cb(message, sender, resolve)));
  return { values, send };
}
test('worker preserves simultaneous reviews and reloads saved progress', async () => {
  const { send, values } = setup();
  const state = await send({ type: 'learning-state' });
  const id = state.cards[0].id;
  await Promise.all([send({ type: 'review', id, outcome: 'known' }), send({ type: 'review', id, outcome: 'known' })]);
  assert.equal(values.reviews[id].reviews, 2);
  assert.equal(values.reviews[id].step, 1);
  const refreshed = await send({ type: 'learning-state' });
  assert.equal(refreshed.reviews[id].reviews, 2);
  assert.ok((await send({ type: 'review', id: 'unknown', outcome: 'known' })).error);
});
test('encounters store only hostnames and approved IDs; opt-out, frames and incognito are excluded', async () => {
  const { send, values } = setup();
  const sender = { tab: { id: 1, incognito: false }, frameId: 0, url: 'https://example.com/private?secret=1' };
  const event = { type: 'encounter', english: ['city', 'not-in-vocabulary'] };
  await send(event, { ...sender, tab: { id: 1, incognito: true } });
  await send(event, { ...sender, frameId: 1 });
  assert.equal(values.domains, undefined);
  assert.equal(values.encounteredWords, undefined);
  await send(event, sender);
  const record = Object.values(values.domains)[0];
  assert.equal(record.hostname, 'example.com');
  assert.equal(Object.keys(record.words).length, 1);
  assert.ok(!JSON.stringify(values.domains).includes('secret'));
  values.trackDomains = false;
  await send({ type: 'encounter', english: ['guitar'] }, { ...sender, url: 'https://other.com/' });
  assert.equal(Object.keys(values.domains).length, 1);
  assert.equal(Object.keys(values.encounteredWords).length, 2);
  assert.ok(!JSON.stringify(values.encounteredWords).includes('other.com'));
  assert.ok((await send({ type: 'clear-domains' }, sender)).error);
  await send({ type: 'clear-domains' });
  assert.deepEqual(values.domains, {});
  assert.equal(Object.keys(values.encounteredWords).length, 2);
});
