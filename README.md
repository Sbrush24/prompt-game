# Prompt Game

A browser game about directing AI coding assistants. It works like Scratch, but the blocks are
prompt fragments. You compose a prompt, a simulated AI builds what it heard, and you check the
result against the client's brief before anyone ships it.

**Level 1: Vagueness has a cost.** A landscaping company wants a contact form. The fragments you
leave vague get filled in with the AI's own defaults, and the AI's report always sounds confident.

## Play

Open `index.html` in a current browser. There is no build step, no server and no dependencies,
so double-clicking the file works.

## How it works

- `js/level1.js` holds everything the level says and decides, as data: the fragments, what each
  one does to the build, the AI's defaults, the report and the brief.
- `js/interpreter.js` is the simulated AI. It is deterministic: each fragment's effects apply in
  order of how plainly they were said (implied < vague < explicit), and the last write wins.
- `js/renderer.js` draws the built page into a desktop frame and a phone frame at real CSS pixel
  widths, so a layout that is too wide for a phone really is too wide.
- `js/builder.js` is the prompt rail. Chips move by drag, by tap, or by keyboard.
- `js/review.js` is the brief: tick what you think the build does, then check it.

## Tests

```sh
npm test
```

This needs Node 22.14 or later. The tests build every prompt the rail can produce (144 of them)
and check the grades against `tests/outcomes.snapshot.json`. After an intended content change,
regenerate the snapshot with `node --test --test-update-snapshots tests/*.test.mjs` and review
the diff.

## Credits

The typeface is [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next),
used under the SIL Open Font License (`fonts/OFL.txt`).
