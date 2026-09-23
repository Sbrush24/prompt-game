// Placement model tests. Run from the project root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/level1.js';
import '../js/builder.js';

const { PG } = globalThis;
const level = PG.levels.level1;
const P = PG.Placement;

const put = (state, id, slot, index = 0) => P.place(state, level, id, slot, index);

test('starts with every socket empty and Run not ready', () => {
  const s = P.create(level);
  assert.deepEqual(s.sockets, { action: [null], thing: [null], constraints: [null], specifics: [null, null] });
  assert.equal(P.isReady(s, level), false);
  assert.deepEqual(P.missingRequired(s, level).map((slot) => slot.id), ['action', 'thing']);
});

test('Run is ready once action and thing are filled; constraints and specifics are optional', () => {
  let s = P.create(level);
  s = put(s, 'build', 'action');
  assert.deepEqual(P.missingRequired(s, level).map((slot) => slot.id), ['thing']);
  s = put(s, 'contact', 'thing');
  assert.equal(P.isReady(s, level), true);
});

test('a chip only fits its own slot', () => {
  const s = P.create(level);
  assert.throws(() => put(s, 'nice', 'specifics'), /only fits the constraints slot/);
  assert.throws(() => put(s, 'mobile', 'action'), /only fits the specifics slot/);
});

test('rejects sockets that do not exist', () => {
  const s = P.create(level);
  assert.throws(() => put(s, 'build', 'action', 1), RangeError);
  assert.throws(() => put(s, 'button', 'specifics', 2), RangeError);
  assert.throws(() => put(s, 'button', 'specifics', -1), RangeError);
});

test('placing into a full single socket sends the old chip back to the tray', () => {
  let s = P.create(level);
  s = put(s, 'nice', 'constraints');
  s = put(s, 'fields', 'constraints');
  assert.deepEqual(s.sockets.constraints, ['fields']);
  assert.equal(P.locate(s, 'nice'), null);
});

test('specifics holds two chips at once', () => {
  let s = P.create(level);
  s = put(s, 'button', 'specifics', 0);
  s = put(s, 'mobile', 'specifics', 1);
  assert.deepEqual(s.sockets.specifics, ['button', 'mobile']);
  assert.equal(P.firstFree(s, 'specifics'), -1);
});

test('moving a chip to the other specifics socket trades places with its occupant', () => {
  let s = P.create(level);
  s = put(s, 'button', 'specifics', 0);
  s = put(s, 'mobile', 'specifics', 1);
  s = put(s, 'button', 'specifics', 1);
  assert.deepEqual(s.sockets.specifics, ['mobile', 'button']);
});

test('moving a chip to the empty specifics socket leaves the old one empty', () => {
  let s = P.create(level);
  s = put(s, 'button', 'specifics', 0);
  s = put(s, 'button', 'specifics', 1);
  assert.deepEqual(s.sockets.specifics, [null, 'button']);
  assert.equal(P.firstFree(s, 'specifics'), 0);
});

test('dropping a chip back on its own socket changes nothing', () => {
  let s = P.create(level);
  s = put(s, 'make', 'action');
  assert.equal(put(s, 'make', 'action'), s);
});

test('remove sends a chip back to the tray; removing an unplaced chip is a no-op', () => {
  let s = P.create(level);
  s = put(s, 'quote', 'thing');
  const removed = P.remove(s, 'quote');
  assert.deepEqual(removed.sockets.thing, [null]);
  assert.equal(P.remove(removed, 'quote'), removed);
});

test('state is never mutated in place', () => {
  const s0 = P.create(level);
  const snapshot = JSON.stringify(s0);
  const s1 = put(s0, 'build', 'action');
  put(s1, 'make', 'action');
  P.remove(s1, 'build');
  assert.equal(JSON.stringify(s0), snapshot);
  assert.deepEqual(s1.sockets.action, ['build']);
});

test('placed() lists fragments in declaration order, not the order they were placed', () => {
  let s = P.create(level);
  s = put(s, 'mobile', 'specifics', 0);
  s = put(s, 'button', 'specifics', 1);
  s = put(s, 'quote', 'thing');
  s = put(s, 'working', 'action');
  assert.deepEqual(P.placed(s, level), ['working', 'quote', 'button', 'mobile']);
});
