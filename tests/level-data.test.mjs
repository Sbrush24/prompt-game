// Level data tests: the content table is the whole game, so a typo in it must fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/level1.js';

const level = globalThis.PG.levels.level1;
const STRENGTHS = new Set(['implied', 'vague', 'explicit']);

test('fragment text matches the design exactly', () => {
  const bySlot = {};
  for (const f of level.fragments) (bySlot[f.slot] ||= []).push(f.text);
  assert.deepEqual(bySlot, {
    action: ['build me', 'make', 'create a working'],
    thing: ['a form', 'a contact form', 'a quote request form'],
    constraints: ['make it nice', 'keep it simple', 'with name, email, and phone fields'],
    specifics: ['make the button say Get a quote', 'mobile friendly'],
  });
});

test('slots: action and thing are required, specifics holds two', () => {
  assert.deepEqual(
    level.slots.map((s) => [s.id, s.capacity, s.required]),
    [['action', 1, true], ['thing', 1, true], ['constraints', 1, false], ['specifics', 2, false]],
  );
});

test('ids are unique and every fragment names a real slot', () => {
  const slotIds = new Set(level.slots.map((s) => s.id));
  const ids = level.fragments.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of level.fragments) assert.ok(slotIds.has(f.slot), `${f.id} -> ${f.slot}`);
});

test('every effect writes a declared property with a legal value and strength', () => {
  for (const f of level.fragments) {
    for (const { prop, value, strength } of f.effects) {
      const spec = level.vocabulary[prop];
      assert.ok(spec, `${f.id}: unknown property "${prop}"`);
      assert.ok(STRENGTHS.has(strength), `${f.id}: unknown strength "${strength}"`);
      if (spec.type === 'bool') assert.equal(typeof value, 'boolean', `${f.id}.${prop}`);
      if (spec.type === 'text') assert.equal(typeof value, 'string', `${f.id}.${prop}`);
      if (spec.type === 'enum') assert.ok(spec.values.includes(value), `${f.id}.${prop}: "${value}"`);
    }
  }
});

test('every default is legal for its property', () => {
  for (const [prop, spec] of Object.entries(level.vocabulary)) {
    if (spec.type === 'enum') assert.ok(spec.values.includes(spec.default), prop);
    if (spec.type === 'bool') assert.equal(typeof spec.default, 'boolean', prop);
    if (spec.type === 'text') assert.equal(typeof spec.default, 'string', prop);
  }
});

test('requirements only read declared properties', () => {
  for (const req of level.requirements) {
    for (const prop of req.reads) assert.ok(level.vocabulary[prop], `${req.id} reads unknown "${prop}"`);
  }
});

test('a fragment never writes the same property twice', () => {
  for (const f of level.fragments) {
    const props = f.effects.map((e) => e.prop);
    assert.equal(new Set(props).size, props.length, f.id);
  }
});
