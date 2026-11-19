const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../learning.js');
require('../grammar-engine.js');
const L = globalThis.ScambioLearning;
test('CSV preserves quoted commas, quotes, newlines, whitespace and duplicates', () => {
  const rows = [['eh, non male', 'oh, not bad'], ['a"b', 'line\nbreak'], [' a ', 'b'], [' a ', 'b']];
  const csv = rows.map(r => r.map(L.csvField).join(',')).join('\r\n');
  assert.deepEqual(L.parseCsv(csv), rows);
  assert.throws(() => L.parseCsv('"unclosed'), /Unclosed/);
});
test('user vocabulary is valid two-column CSV', () => {
  const rows = L.parseCsv(fs.readFileSync('vocabulary.csv', 'utf8'));
  assert.ok(rows.length >= 536);
  assert.ok(rows.every(r => r.length === 2), 'Every row must have two columns');
});
test('card IDs survive reordering and exact duplicates share progress', () => {
  const a = { italian: 'città', english: 'city' }, b = { italian: 'città', english: 'town' };
  assert.equal(L.cards([a,b,a]).length, 2);
  assert.equal(L.cards([a,b])[0].id, L.cards([b,a])[1].id);
});
test('reviews advance, cap, and reset on a lapse', () => {
  let state;
  for (const days of [1,3,7,14,30,60,60]) {
    state = L.review(state, 'known', 1000);
    assert.equal(state.due, 1000 + days * 86400000);
  }
  state = L.review(state, 'again', 1000);
  assert.equal(state.due, 601000);
  assert.equal(L.review(state, 'known', 1000).due, 86401000);
  assert.throws(() => L.review(state, 'easy'));
});
const noun = { english:'city', italian:'città', partOfSpeech:'noun', gender:'feminine', number:'singular' };
const adjective = { english:'clear', italian:'chiaro', partOfSpeech:'adjective', feminineSingular:'chiara' };
test('grammar cannot inject absent words or absent inflections', () => {
  const run = replacements => ScambioGrammar.replaceText('the clear city', replacements, [noun, adjective]);
  assert.equal(run({city:'città',clear:'chiaro'}), 'the clear city');
  assert.equal(run({city:'città',clear:'chiaro',approved:'la chiara'}), 'la città chiara');
  assert.equal(ScambioGrammar.replaceText('the city', {}, [noun]), 'the city');
});
test('bare adjective phrases, protected prepositions and exact encounter attribution', () => {
  const seen = [];
  const replacements = { city:'città',clear:'chiaro',approved:'la chiara' };
  assert.equal(ScambioGrammar.replaceText('clear city', replacements, [noun,adjective], e => seen.push(...e)), 'città chiara');
  assert.deepEqual(seen, ['city','clear']);
  assert.equal(ScambioGrammar.replaceText('in the clear city', replacements, [noun,adjective]), 'in the clear city');
});
