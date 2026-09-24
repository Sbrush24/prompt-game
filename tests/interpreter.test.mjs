// Interpreter tests: every prompt the builder can produce, checked against the rules the lesson
// depends on, plus a generated snapshot of every build and its grades, so a content edit shows
// its full effect as a diff.
// Run: node --test          After an intended change: node --test --test-update-snapshots
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import '../js/level1.js';
import '../js/interpreter.js';

const { PG } = globalThis;
const level = PG.levels.level1;
const I = PG.Interpreter;
const prompts = I.allPrompts(level);
const results = prompts.map((ids) => I.interpret(level, ids));
const byId = new Map(level.fragments.map((f) => [f.id, f]));
const isVague = (id) => byId.get(id).effects.some((e) => e.strength === 'vague');
const reqById = new Map(level.requirements.map((r) => [r.id, r]));

test('the level data is valid', () => {
  assert.doesNotThrow(() => I.validateLevel(level));
});

test('a typo in the level data throws when the page loads', () => {
  // The level holds functions (checks, report lines), so clone only its plain data.
  const broken = (change) => {
    const copy = structuredClone({ ...level, requirements: [], report: { lines: [] } });
    change(copy);
    return () => I.validateLevel({ ...copy, requirements: level.requirements, report: level.report });
  };
  const password = (l) => l.formFields.find((f) => f.secret);
  assert.throws(broken((l) => { password(l).prop = 'field.pasword'; }), /form field "Password"/);
  assert.throws(broken((l) => { l.formFields.push({ ...l.formFields[0] }); }), /listed twice/);
  assert.throws(broken((l) => { l.formFields.push({ prop: 'heading', label: 'Heading' }); }), /non-yes\/no/);
  assert.throws(broken((l) => { l.fragments[0].effects.push({ prop: 'submitLabel', value: 'x', strength: 'toString' }); }), /bad strength/);
  assert.throws(broken((l) => { l.fragments[0].effects.push({ prop: 'constructor', value: true, strength: 'explicit' }); }), /unknown property/);
  assert.throws(broken((l) => { l.fragments[0].effects.push({ prop: 'layout', value: 'wide', strength: 'explicit' }); }), /illegal value/);
});

test('the builder can produce 144 distinct prompts', () => {
  assert.equal(prompts.length, 144);
  assert.equal(new Set(prompts.map((p) => p.join('+'))).size, 144);
});

test('9 prompts pass: three different prompts, each with any verb', () => {
  const passing = results.filter((r) => r.passed);
  assert.equal(passing.length, 9);
  const withoutVerb = new Set(passing.map((r) => r.placed.slice(1).join('+')));
  assert.deepEqual([...withoutVerb].sort(), [
    'contact+fields+button+mobile',
    'quote+button+mobile',
    'quote+fields+button+mobile',
  ]);
});

test('vagueness never earns credit: no passing prompt contains a vague fragment', () => {
  for (const r of results.filter((x) => x.passed)) {
    assert.deepEqual(r.placed.filter(isVague), [], r.placed.join('+'));
  }
});

test('every requirement is met by some prompt and missed by another', () => {
  for (const req of level.requirements) {
    const met = results.map((r) => r.requirements.find((x) => x.id === req.id).met);
    assert.ok(met.includes(true), `${req.id} is never met`);
    assert.ok(met.includes(false), `${req.id} is never missed`);
  }
});

test('the brief\'s own example: "make it nice" yields no phone field and a "Submit" button', () => {
  for (const thing of ['form', 'contact', 'quote']) {
    const { spec } = I.interpret(level, ['build', thing, 'nice']);
    assert.equal(spec['field.phone'], false, thing);
    assert.equal(spec.submitLabel, 'Submit', thing);
  }
});

test('the order chips were placed in never changes the result', () => {
  for (const ids of prompts) {
    const reversed = I.interpret(level, [...ids].reverse());
    assert.deepEqual(reversed, I.interpret(level, ids), ids.join('+'));
  }
});

test('no two fragments that can sit together fight over a property at the same strength', () => {
  const canCoexist = (a, b) => a.slot !== b.slot || level.slots.find((s) => s.id === a.slot).capacity > 1;
  const conflicts = [];
  for (const a of level.fragments) {
    for (const b of level.fragments) {
      if (a.id >= b.id || !canCoexist(a, b)) continue;
      for (const ea of a.effects) {
        for (const eb of b.effects) {
          if (ea.prop === eb.prop && ea.strength === eb.strength && ea.value !== eb.value) {
            conflicts.push(`${a.id} vs ${b.id} on ${ea.prop}`);
          }
        }
      }
    }
  }
  assert.deepEqual(conflicts, []);
});

test('every missed requirement has something to point at: the chip that caused it, or the AI\'s own line', () => {
  // A chip is to blame only if it made the winning write and nothing placed outranks it.
  const wrote = (id, prop, match) => byId.get(id).effects.some((e) => e.prop === prop && match(e));
  for (const r of results) {
    const lines = I.report(level, r).lines;
    for (const { id, met } of r.requirements) {
      if (met) continue;
      for (const prop of reqById.get(id).reads) {
        const { source, strength } = r.why[prop];
        const pointable = source !== 'default'
          ? r.placed.includes(source)
            && wrote(source, prop, (e) => e.value === r.spec[prop] && e.strength === strength)
            && !r.placed.some((other) => wrote(other, prop, (e) => I.RANK[e.strength] > I.RANK[strength]))
          : lines.some((line) => line.reads.includes(prop));
        assert.ok(pointable, `${r.placed.join('+')}: ${id} via ${prop} (${source})`);
      }
    }
  }
});

test('the AI\'s report is always confident and never quotes the brief', () => {
  const briefTexts = level.requirements.map((req) => req.text.toLowerCase());
  for (const r of results) {
    const rep = I.report(level, r);
    assert.ok(rep.lines.length >= 3, r.placed.join('+'));
    for (const text of [rep.opener, ...rep.lines.map((l) => l.text), rep.closer]) {
      assert.ok(!briefTexts.some((b) => text.toLowerCase().includes(b)), text);
    }
  }
});

test('the prompt reads back as a sentence', () => {
  assert.equal(I.promptText(level, ['nice', 'contact', 'build']), 'build me a contact form, make it nice');
  assert.equal(
    I.promptText(level, ['working', 'quote', 'fields', 'button', 'mobile']),
    'create a working quote request form with name, email, and phone fields, make the button say Get a quote, mobile friendly',
  );
});

test('every build and its grades match the snapshot (--test-update-snapshots regenerates it)', (t) => {
  const file = fileURLToPath(new URL('./outcomes.snapshot.json', import.meta.url));
  const rows = results.map((r) => {
    const outcome = {};
    for (const { id, met } of r.requirements) {
      const causes = reqById.get(id).reads.map((prop) => r.why[prop].source);
      outcome[id] = `${met ? 'met' : 'MISSED'} by ${causes.join(', ')}`;
    }
    // What got built, walked from the spec so a new property shows up here on its own.
    const built = Object.entries(r.spec)
      .filter(([, value]) => value !== false)
      .map(([prop, value]) => (value === true ? prop : `${prop}=${value}`))
      .join(' ');
    return { prompt: r.placed.join(' + '), passed: r.passed, ...outcome, built };
  });
  const text = `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]\n`;
  t.assert.fileSnapshot(text, file, { serializers: [(value) => value] });
});
