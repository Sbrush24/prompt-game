// Kids Level 1: the same engine with new content, so the same guarantees. The level must load,
// only prompts that say every wish plainly may pass, Bolt must never mention Maya's list, and
// every build is graded against a snapshot.
// Run: npm test (Node 22.14+)    After an intended change: node --test --test-update-snapshots tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import '../js/kids/level1.js';
import '../js/interpreter.js';

const level = globalThis.PG.levels.kids1;
const I = globalThis.PG.Interpreter;
const results = I.allPrompts(level).map((ids) => I.interpret(level, ids));
const reqById = new Map(level.requirements.map((r) => [r.id, r]));

test('the level data passes the same checks the page runs on load', () => {
  assert.doesNotThrow(() => I.validateLevel(level));
  assert.equal(results.length, 144);
});

test('a fuzzy prompt fails every wish', () => {
  const r = I.interpret(level, ['make', 'game', 'cool']);
  assert.deepEqual(r.requirements.map((q) => q.met), [false, false, false, false]);
  assert.equal(I.promptText(level, ['make', 'game', 'cool']), 'make a game, make it cool');
});

test('passing takes the cat, the fish, the speed and the score, all said plainly', () => {
  for (const r of results.filter((x) => x.passed)) {
    assert.ok(r.placed.includes('catfish') && r.placed.includes('slow'), r.placed.join('+'));
    // The score comes from "show the score" or from a catch game, which implies one.
    assert.ok(r.placed.includes('points') || r.placed.includes('catch'), r.placed.join('+'));
  }
  assert.ok(results.some((r) => r.passed));
});

// "make it easy" can land on the right speed by luck, as "keep it simple" can land on a
// phone-friendly layout in the grown-up level. "make it cool" never helps.
test('"make it cool" never makes a wish come true', () => {
  for (const r of results) {
    for (const { id, met } of r.requirements) {
      if (!met) continue;
      for (const prop of reqById.get(id).reads) {
        assert.notEqual(r.why[prop].cause, 'cool', `${id} in ${r.placed.join('+')}`);
      }
    }
  }
});

test('Bolt is always sure of himself and never mentions the wish list', () => {
  const wishes = level.requirements.map((q) => q.text.toLowerCase());
  for (const r of results) {
    const rep = I.report(level, r);
    assert.match(rep.closer, /perfect/);
    for (const text of [rep.opener, ...rep.lines.map((l) => l.text)]) {
      assert.ok(!wishes.some((w) => text.toLowerCase().includes(w)), text);
      assert.ok(!/maya/i.test(text), text);
    }
  }
});

test('every build and its grades match the snapshot (--test-update-snapshots regenerates it)', (t) => {
  const file = fileURLToPath(new URL('./kids-outcomes.snapshot.json', import.meta.url));
  const rows = results.map((r) => {
    const outcome = {};
    for (const { id, met } of r.requirements) {
      const causes = reqById.get(id).reads.map((prop) => r.why[prop].cause);
      outcome[id] = `${met ? 'met' : 'MISSED'} by ${causes.join(', ')}`;
    }
    const built = Object.entries(r.spec)
      .filter(([, value]) => value !== false)
      .map(([prop, value]) => (value === true ? prop : `${prop}=${value}`))
      .join(' ');
    return { prompt: r.placed.join(' + '), passed: r.passed, ...outcome, built };
  });
  const text = `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]\n`;
  t.assert.fileSnapshot(text, file, { serializers: [(value) => value] });
});
