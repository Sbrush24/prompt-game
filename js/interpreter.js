/* The simulated AI. Deterministic, no network, nothing learned: it reads the fragments the
   player placed and resolves them into a build spec.

   Every property starts at the AI's own default. Each placed fragment's effects are then
   applied in order of (strength, slot, fragment order), so the last write wins: explicit beats
   vague beats implied beats default, and ties go to the fragment later in the sentence.
   Nothing here knows about forms, phones or buttons; that all lives in the level data.

   For each property it also records the `cause`: the chip whose write last changed its value,
   or 'default' if no chip changed it. A write that repeats the value already there changes
   nothing, so taking out the cause, and only the cause, would change what was built. */
(function (PG) {
  'use strict';

  const RANK = { default: 0, implied: 1, vague: 2, explicit: 3 };

  function interpret(level, placedIds) {
    const order = new Map(level.fragments.map((f, i) => [f.id, i]));
    const slotOrder = new Map(level.slots.map((s, i) => [s.id, i]));
    const placed = canonical(level, placedIds);

    const spec = {};
    const why = {};
    for (const [prop, def] of Object.entries(level.vocabulary)) {
      spec[prop] = def.default;
      why[prop] = { source: 'default', strength: 'default', cause: 'default' };
    }

    const effects = [];
    for (const id of placed) {
      const frag = level.fragments[order.get(id)];
      frag.effects.forEach((effect, n) => {
        effects.push({ ...effect, source: id, key: [RANK[effect.strength], slotOrder.get(frag.slot), order.get(id), n] });
      });
    }
    effects.sort((a, b) => compareKeys(a.key, b.key));
    for (const { prop, value, strength, source } of effects) {
      const cause = value === spec[prop] ? why[prop].cause : source;
      spec[prop] = value;
      why[prop] = { source, strength, cause };
    }

    const requirements = level.requirements.map((req) => ({ id: req.id, met: req.met(spec) === true }));
    return { placed, spec, why, requirements, passed: requirements.every((r) => r.met) };
  }

  // What the AI says afterwards. Built from the resolved spec, so it always matches the build.
  function report(level, result) {
    const lines = [];
    for (const line of level.report.lines) {
      const text = line.say(result.spec, result.why);
      if (text) lines.push({ id: line.id, reads: line.reads, text });
    }
    return { opener: level.report.opener(result.spec), lines, closer: level.report.closer };
  }

  // Who is behind each missed requirement: the chips that changed a property it reads, or,
  // where the AI's own default stands, the report lines in which the AI describes that choice.
  function blame(level, result, reported) {
    const missed = result.requirements.filter((r) => !r.met).map((r) => level.requirements.find((q) => q.id === r.id));
    return missed.map((req) => {
      const chips = [...new Set(req.reads.map((prop) => result.why[prop].cause).filter((cause) => cause !== 'default'))];
      const own = req.reads.filter((prop) => result.why[prop].cause === 'default');
      const lines = reported.lines.filter((line) => line.reads.some((prop) => own.includes(prop))).map((line) => line.id);
      return { id: req.id, chips, lines };
    });
  }

  // The prompt as the player wrote it, e.g. "build me a contact form, make it nice".
  function promptText(level, placedIds) {
    let text = '';
    let previous = null;
    for (const id of canonical(level, placedIds)) {
      const frag = level.fragments.find((f) => f.id === id);
      const words = previous && previous.dropsNextArticle ? frag.text.replace(/^an? /, '') : frag.text;
      text += (previous ? frag.lead ?? ' ' : '') + words;
      previous = frag;
    }
    return text;
  }

  // Every prompt the builder can produce: one choice per required slot, up to capacity elsewhere.
  function allPrompts(level) {
    let prompts = [[]];
    for (const slot of level.slots) {
      const ids = level.fragments.filter((f) => f.slot === slot.id).map((f) => f.id);
      const choices = subsets(ids, slot.capacity).filter((c) => !slot.required || c.length > 0);
      prompts = prompts.flatMap((p) => choices.map((c) => [...p, ...c]));
    }
    return prompts;
  }

  // Throws on the first thing in the level data that would silently mis-grade a build.
  function validateLevel(level) {
    const fail = (message) => { throw new Error(`${level.id}: ${message}`); };
    const declared = (prop) => Object.hasOwn(level.vocabulary, prop);
    const slotIds = new Set(level.slots.map((s) => s.id));
    const seen = new Set();
    for (const [prop, def] of Object.entries(level.vocabulary)) {
      if (!legal(def, def.default)) fail(`default for "${prop}" is not a legal value`);
    }
    for (const frag of level.fragments) {
      if (seen.has(frag.id)) fail(`duplicate fragment id "${frag.id}"`);
      seen.add(frag.id);
      if (!slotIds.has(frag.slot)) fail(`fragment "${frag.id}" names unknown slot "${frag.slot}"`);
      for (const { prop, value, strength } of frag.effects) {
        if (!declared(prop)) fail(`fragment "${frag.id}" writes unknown property "${prop}"`);
        if (!Object.hasOwn(RANK, strength) || strength === 'default') fail(`fragment "${frag.id}" has bad strength "${strength}"`);
        if (!legal(level.vocabulary[prop], value)) fail(`fragment "${frag.id}" writes illegal value ${JSON.stringify(value)} to "${prop}"`);
      }
    }
    for (const item of [...level.requirements, ...level.report.lines]) {
      for (const prop of item.reads) if (!declared(prop)) fail(`"${item.id}" reads unknown property "${prop}"`);
    }
    // The renderer draws one field per entry, each shown when its yes/no property is true.
    const drawn = new Set();
    for (const field of level.formFields) {
      if (!declared(field.prop) || level.vocabulary[field.prop].type !== 'bool') {
        fail(`form field "${field.label}" shows unknown or non-yes/no property "${field.prop}"`);
      }
      if (drawn.has(field.prop)) fail(`form field property "${field.prop}" is listed twice`);
      drawn.add(field.prop);
    }
    // The checks, the report and the read-back are hand-written functions: run them once for
    // every prompt, so a slip in one stops the page here instead of jamming a build later.
    for (const ids of allPrompts(level)) {
      try {
        report(level, interpret(level, ids));
        promptText(level, ids);
      } catch (error) {
        fail(`building "${ids.join(' + ')}" throws: ${error.message}`);
      }
    }
    return level;
  }

  function legal(def, value) {
    if (def.type === 'bool') return typeof value === 'boolean';
    if (def.type === 'text') return typeof value === 'string';
    if (def.type === 'enum') return def.values.includes(value);
    return false;
  }

  function canonical(level, ids) {
    const wanted = new Set(ids);
    return level.fragments.map((f) => f.id).filter((id) => wanted.has(id));
  }

  function compareKeys(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }

  function subsets(items, max) {
    const out = [[]];
    for (const item of items) {
      for (const s of out.slice()) if (s.length < max) out.push([...s, item]);
    }
    return out;
  }

  PG.Interpreter = { interpret, report, blame, promptText, allPrompts, validateLevel, RANK };
})(globalThis.PG = globalThis.PG || {});
