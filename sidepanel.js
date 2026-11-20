const $ = id => document.getElementById(id);
let data, current, busy = false, windowId, request = 0, source = '', page = {};
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw new Error(result.error);
  return result;
}
function error(error) { $('status').textContent = error.message; }
function chooseCard(preserve = false) {
  if (!data) return;
  const mode = $('mode').value;
  const winners = new Map();
  for (const card of data.cards) if (!winners.has(card.english.toLocaleLowerCase())) winners.set(card.english.toLocaleLowerCase(), card.id);
  const pageIds = (page.english || []).map(word => winners.get(word)).filter(Boolean);
  const encountered = new Set(Object.keys(data.encounteredWords));
  for (const domain of Object.values(data.domains)) Object.keys(domain.words).forEach(id => encountered.add(id));
  const { eligible, due, fresh, ready } = ScambioLearning.queue(data.cards, data.reviews, mode, pageIds, [...encountered]);
  const keep = preserve && current && ready.some(c => c.id === current.id);
  if (!keep) current = ready[0];
  $('summary').textContent = `${due.length} due · ${fresh.length} new · ${eligible.length} ${mode === 'page' ? 'words on this page' : 'eligible cards'}`;
  if (!keep) {
    $('answer').hidden = true; $('ratings').hidden = true;
    $('reveal').hidden = !current; $('reveal').disabled = !current;
    $('prompt').textContent = current?.english || (eligible.length ? 'All caught up.' : 'No words here yet.');
    $('answer').textContent = current?.italian || '';
  }
  $('card-state').textContent = current ? (data.reviews[current.id] ? 'REVIEW / ENGLISH → ITALIAN' : 'NEW / ENGLISH → ITALIAN') : 'TAKE A BREATHER';
  const next = eligible.map(c => data.reviews[c.id]?.due).filter(due => due > Date.now()).sort((a,b) => a-b)[0];
  const sites = current ? Object.values(data.domains).filter(d => d.words[current.id]).map(d => d.hostname) : [];
  $('context').textContent = current ? (mode === 'page' ? 'Replaced on the active page' : sites.length ? `Encountered on ${sites.slice(0,3).join(', ')}` : mode === 'due' ? 'Encountered during your browsing' : 'From your vocabulary list')
    : mode === 'page' && page.unavailable ? 'This page is unavailable. On ordinary webpages, refresh the tab after reloading Scambio.'
    : mode === 'page' && page.enabled === false ? 'Webpage replacements are paused. Enable them in the popup to collect words.'
    : next ? `Next review: ${new Date(next).toLocaleString()}`
    : mode === 'due' ? 'No encountered cards are due. Practise words on a page first; they will return here when scheduled.'
    : 'No vocabulary replacements on this page yet. Try another page or choose All vocabulary.';
}
async function load(preserve = true) {
  const version = ++request;
  const [nextData, tabs] = await Promise.all([send({ type: 'learning-state' }), chrome.tabs.query({ active: true, windowId })]);
  const tab = tabs[0];
  let nextPage = { unavailable: true, english: [] };
  if (tab?.id) {
    try { nextPage = await chrome.tabs.sendMessage(tab.id, { type: 'page-words' }, { frameId: 0 }) || nextPage; }
    catch (_) { /* Restricted pages and tabs awaiting reload have no content script. */ }
  }
  if (version !== request) return;
  const nextSource = `${tab?.id}:${nextPage.pageKey || ''}`;
  data = nextData; page = nextPage;
  $('tracking').checked = data.trackDomains;
  $('coverage').textContent = `${data.grammarEntries.filter(g => data.cards.some(c => c.english === g.english && c.italian === g.italian)).length} vocabulary entries have matching grammar metadata.`;
  chooseCard(preserve && (source === nextSource || $('mode').value !== 'page'));
  source = nextSource;
}
$('reveal').onclick = () => { $('answer').hidden = false; $('ratings').hidden = false; $('reveal').hidden = true; $('known').focus(); };
for (const outcome of ['again', 'known']) $(outcome).onclick = async () => {
  if (busy || !current) return;
  busy = true;
  $('again').disabled = $('known').disabled = true;
  try {
    await send({ type: 'review', id: current.id, outcome });
    await load(false); $('status').textContent = 'Review saved.';
    if (current) $('reveal').focus();
  } catch (e) { error(e); }
  finally { busy = false; $('again').disabled = $('known').disabled = false; }
};
$('mode').onchange = () => chooseCard();
$('tracking').onchange = async () => {
  try { await chrome.storage.local.set({ trackDomains: $('tracking').checked }); await send({ type: 'settings-changed' }); await load(); }
  catch (e) { error(e); }
};
$('clear').onclick = async () => {
  if (!confirm('Clear all saved site history? Your encountered words and review progress will be kept.')) return;
  try { await send({ type: 'clear-domains' }); await load(); $('status').textContent = 'Site history cleared.'; } catch (e) { error(e); }
};
function pageChanged() {
  ++request;
  if ($('mode').value === 'page') { page = { english: [] }; current = null; chooseCard(); }
  load(false).catch(error);
}
chrome.tabs.onActivated.addListener(info => { if (info.windowId === windowId) pageChanged(); });
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (tab.active && tab.windowId === windowId && (change.status || change.url)) pageChanged();
});
// Dynamic pages can remove matches; poll connected nodes while preserving a revealed card.
setInterval(() => { if (!busy && windowId !== undefined) load().catch(error); }, 3000);
chrome.windows.getCurrent().then(window => { windowId = window.id; return load(false); }).catch(error);
