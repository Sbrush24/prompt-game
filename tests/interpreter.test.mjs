// Interpreter tests: every prompt the builder can produce, checked against the rules the lesson
// depends on, plus a generated snapshot of every build and its grades, so a content edit shows
// its full effect as a diff.
// Run: npm test (Node 22.14+)    After an intended change: node --test --test-update-snapshots tests/*.test.mjs
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

test('a slip in the brief, the report or the ids throws when the page loads', () => {
  const withReqs = (change) => () => I.validateLevel({ ...level, requirements: change(level.requirements.map((r) => ({ ...r }))) });
  const mobile = (reqs) => reqs.find((r) => r.id === 'mobile');
  assert.throws(withReqs((reqs) => { mobile(reqs).seen = (spec) => spec.layout.nope(); return reqs; }), /seen\(\) throws/);
  assert.throws(withReqs((reqs) => { mobile(reqs).seen = () => ''; return reqs; }), /no note/);
  assert.throws(withReqs((reqs) => { mobile(reqs).met = () => 'yes'; return reqs; }), /not true or false/);
  assert.throws(withReqs((reqs) => { mobile(reqs).met = (spec) => spec.layout === 'fluid' && spec.theme !== 'fancy'; return reqs; }), /depends on "theme"/);
  assert.throws(withReqs((reqs) => [...reqs, reqs[0]]), /duplicate requirement id/);
  assert.throws(withReqs(() => []), /no requirements/);
  assert.throws(() => I.validateLevel({ ...level, report: { ...level.report, lines: [...level.report.lines, level.report.lines[0]] } }), /duplicate report line id/);
  assert.throws(() => I.validateLevel({ ...level, fragments: level.fragments.map((f) => (f.id === 'nice' ? { ...f, id: 'default' } : f)) }), /"default" is taken/);
  assert.throws(() => I.validateLevel({ ...level, fragments: level.fragments.filter((f) => f.slot !== 'thing') }), /no prompt can be built/);
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

// Rebuild without one chip, to see what that chip changed.
const without = (r, id) => I.interpret(level, r.placed.filter((x) => x !== id));

test('every miss is blamed on something: the chips that changed it, or the AI\'s own report lines', () => {
  for (const r of results) {
    const reported = I.report(level, r);
    for (const { id, chips, lines } of I.blame(level, r, reported)) {
      const name = `${r.placed.join('+')}: ${id}`;
      assert.ok(chips.length + lines.length > 0, `${name} blames nothing`);
      for (const line of lines) assert.ok(reported.lines.some((l) => l.id === line), `${name}: no report line "${line}"`);
    }
  }
});

test('a chip is blamed only if taking it out would change what the brief item checks', () => {
  for (const r of results) {
    for (const { id, chips, lines } of I.blame(level, r, I.report(level, r))) {
      const reads = reqById.get(id).reads;
      for (const chip of chips) {
        const other = without(r, chip);
        assert.ok(reads.some((prop) => other.spec[prop] !== r.spec[prop]), `${r.placed.join('+')}: ${id} blamed on ${chip}, which changed nothing`);
      }
      // Where the AI is blamed, no single chip could have changed it.
      if (lines.length) {
        const own = reads.filter((prop) => r.why[prop].cause === 'default');
        for (const chip of r.placed) {
          const other = without(r, chip);
          assert.ok(own.every((prop) => other.spec[prop] === r.spec[prop]), `${r.placed.join('+')}: ${id} blamed on the AI, but ${chip} changed it`);
        }
      }
    }
  }
});

test('the brief\'s own example: "make it nice" is blamed for the layout it changed, the AI for its defaults', () => {
  const r = I.interpret(level, ['build', 'contact', 'nice']);
  assert.deepEqual(I.blame(level, r, I.report(level, r)), [
    { id: 'phone', chips: [], lines: ['fields'] },
    { id: 'mobile', chips: ['nice'], lines: [] },
    { id: 'button', chips: [], lines: ['button'] },
  ]);
  const q = I.interpret(level, ['build', 'quote', 'nice']);
  assert.deepEqual(I.blame(level, q, I.report(level, q)).map((b) => [b.id, b.chips.join()]), [
    ['phone', 'nice'], ['mobile', 'nice'], ['button', 'nice'],
  ]);
});

test('the AI only says it streamlined the fields when a chip really took one away', () => {
  for (const r of results) {
    const line = I.report(level, r).lines.find((l) => l.id === 'fields');
    const removed = level.formFields.filter((f) => !f.secret && !r.spec[f.prop] && r.why[f.prop].cause !== 'default');
    assert.equal(line.text.startsWith('Streamlined'), removed.length > 0, r.placed.join('+'));
    for (const f of removed) assert.equal(without(r, r.why[f.prop].cause).spec[f.prop], true, `${r.placed.join('+')}: ${f.prop}`);
  }
});

test('each brief item\'s note says what the page shows, never why or which chip', () => {
  const chipWords = level.fragments.map((f) => f.text.toLowerCase());
  for (const req of level.requirements) {
    const notes = new Map();
    for (const r of results) {
      const met = r.requirements.find((x) => x.id === req.id).met;
      const note = req.seen(r.spec);
      assert.ok(typeof note === 'string' && note.length > 0, req.id);
      assert.ok(!chipWords.some((w) => note.toLowerCase().includes(w)), note);
      assert.ok(!/because|should|try|fix|prompt/i.test(note), note);
      if (!notes.has(note)) notes.set(note, new Set());
      notes.get(note).add(met);
    }
    // A note never belongs to both a met and a missed build, so it can be trusted at a glance.
    for (const [note, mets] of notes) assert.equal(mets.size, 1, `${req.id}: "${note}"`);
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
  // Within a slot the chips read in the order they sit on the rail.
  assert.equal(
    I.promptText(level, ['build', 'contact', 'mobile', 'button']),
    'build me a contact form, mobile friendly, make the button say Get a quote',
  );
});

test('every build and its grades match the snapshot (--test-update-snapshots regenerates it)', (t) => {
  const file = fileURLToPath(new URL('./outcomes.snapshot.json', import.meta.url));
  const rows = results.map((r) => {
    const outcome = {};
    for (const { id, met } of r.requirements) {
      const causes = reqById.get(id).reads.map((prop) => r.why[prop].cause);
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
