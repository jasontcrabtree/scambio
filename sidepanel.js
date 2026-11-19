const $ = id => document.getElementById(id);
let data, current, busy = false;
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw new Error(result.error);
  return result;
}
function error(error) { $('status').textContent = error.message; }
function render() {
  const selected = $('domain').value;
  $('domain').replaceChildren(new Option('All vocabulary', ''));
  for (const [key, domain] of Object.entries(data.domains).sort((a, b) => b[1].lastSeen - a[1].lastSeen)) {
    $('domain').add(new Option(`${domain.hostname} · ${Object.keys(domain.words).length} words`, key));
  }
  $('domain').value = data.domains[selected] ? selected : '';
  $('tracking').checked = data.trackDomains;
  const activeGrammar = data.grammarEntries.filter(g => data.cards.some(c => c.english.toLowerCase() === g.english.toLowerCase() && c.italian === g.italian));
  $('coverage').textContent = `${activeGrammar.filter(g => g.partOfSpeech === 'noun').length} noun entries and ${activeGrammar.filter(g => g.partOfSpeech === 'adjective').length} adjective entries have explicit metadata matching your vocabulary.`;
  chooseCard();
}
function chooseCard() {
  const words = data.domains[$('domain').value]?.words;
  const cards = data.cards.filter(c => !words || words[c.id]);
  const now = Date.now();
  const due = cards.filter(c => data.reviews[c.id]?.due <= now).sort((a, b) => data.reviews[a.id].due - data.reviews[b.id].due);
  const fresh = cards.filter(c => !data.reviews[c.id]);
  current = due[0] || fresh[0];
  $('summary').textContent = `${due.length} due · ${fresh.length} new · ${cards.length} cards`;
  $('answer').hidden = true; $('ratings').hidden = true;
  $('reveal').hidden = !current; $('reveal').disabled = !current;
  $('prompt').textContent = current?.english || (cards.length ? 'All caught up.' : 'No words here yet.');
  $('answer').textContent = current?.italian || '';
  $('card-state').textContent = current ? (data.reviews[current.id] ? 'REVIEW / ENGLISH → ITALIAN' : 'NEW / ENGLISH → ITALIAN') : 'TAKE A BREATHER';
  const next = cards.map(c => data.reviews[c.id]?.due).filter(Boolean).sort((a,b) => a-b)[0];
  const sites = current ? Object.values(data.domains).filter(d => d.words[current.id]).map(d => d.hostname) : [];
  $('context').textContent = current ? (sites.length ? `Encountered on ${sites.slice(0, 3).join(', ')}` : 'From your vocabulary list') : next ? `Next review: ${new Date(next).toLocaleString()}` : 'Enable site history and browse to collect matches, or choose All vocabulary.';
}
async function load() { data = await send({ type: 'learning-state' }); render(); }
$('reveal').onclick = () => { $('answer').hidden = false; $('ratings').hidden = false; $('reveal').hidden = true; $('known').focus(); };
for (const outcome of ['again', 'known']) $(outcome).onclick = async () => {
  if (busy || !current) return;
  busy = true;
  $('again').disabled = $('known').disabled = true;
  try {
    await send({ type: 'review', id: current.id, outcome });
    await load(); $('status').textContent = 'Review saved.';
    if (current) $('reveal').focus();
  } catch (e) { error(e); }
  finally { busy = false; $('again').disabled = $('known').disabled = false; }
};
$('domain').onchange = chooseCard;
$('tracking').onchange = async () => {
  try { await chrome.storage.local.set({ trackDomains: $('tracking').checked }); await send({ type: 'settings-changed' }); await load(); }
  catch (e) { error(e); }
};
$('clear').onclick = async () => {
  if (!confirm('Clear all saved site history? Your review progress will be kept.')) return;
  try { await send({ type: 'clear-domains' }); await load(); $('status').textContent = 'Site history cleared.'; } catch (e) { error(e); }
};
// Refresh between cards without hiding an answer the learner is considering.
setInterval(() => { if (!busy && $('answer').hidden) load().catch(error); }, 30000);
load().catch(error);
