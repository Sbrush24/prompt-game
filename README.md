# Prompt Game

A browser game about directing AI coding assistants. It works like Scratch, but the blocks are
prompt fragments. You build a prompt, a simulated AI builds what it heard, and you check the
result against the client's brief before anyone ships it.

[Play it in your browser](https://sbrush24.github.io/prompt-game/). There is nothing to install and a round takes about two minutes.

![A vague prompt, "build me a form, make it nice", produces a form with a password field, a Submit button and a layout too wide for a phone. The AI reports it is ready to ship, and all four brief items fail.](docs/vague-prompt.gif)

**Level 1: Vagueness has a cost.** A landscaping company wants a contact form. Any part of the
prompt you leave vague gets filled in with the AI's own defaults, and the AI's report always
sounds confident. In the GIF above, "build me a form, make it nice" gets a password field nobody
asked for, a "Submit" button, and a layout that is too wide for the phone. The AI says the form is
ready to ship. The form fails every item on the brief.

## Why the AI is simulated

This game could have called a real model. I decided against it for four reasons.

- The failure has to happen every time. The lesson is that a vague prompt gets filled in with
  someone else's defaults. A real model might guess right by luck or fail in a different way each
  run, and then the level teaches nothing. Here a vague prompt fails the same way every time, a
  precise prompt passes every time.
- It can be tested. The interpreter takes the placed fragments and returns a build spec, with
  nothing random in between. Because of that, every prompt the rail can produce (144 of them) is
  graded in CI and checked against a snapshot. A live model cannot be tested that way.
- It needs nothing to run. The game is static files, so it runs from GitHub Pages or from
  double-clicking `index.html`. There is no API key, and playing it does not cost anyone money.
- The AI's confidence is written on purpose. The report is built from the build spec, so it always
  describes what the AI actually built and it always sounds sure of itself. The gap between the
  confident report and the brief is what the player is supposed to learn to check.

The downside is that the player picks from fixed fragments instead of typing freely. The game
teaches a habit, being explicit about what matters and then checking the result, rather than the
quirks of any one model.

## How it works

- `js/level1.js` holds everything the level says and decides, as data: the fragments, what each
  fragment does to the build, the AI's defaults, the report and the brief.
- `js/interpreter.js` is the simulated AI. Each fragment's effects apply in order of how plainly
  they were said (implied, then vague, then explicit), and the last write wins. It also records
  which chip caused each property, so a failed brief item can point at the chip behind it.
- `js/renderer.js` draws the built page into a desktop frame and a phone frame at real CSS pixel
  widths. A layout that is too wide for a phone is actually too wide on screen.
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

`tests/render-check.html` checks the visual side. Open it in a browser and it draws all 144 builds
in both device frames, then confirms that what is on screen matches the grader.

## What I would do differently

- Show the controls on screen. To place a chip you tap the chip and then tap a socket, and nothing
  tells you that until you have already tapped a chip. I tested every prompt the game can grade,
  I did not test the first ten seconds of a new player.
- Run the render check in CI. `tests/render-check.html` passes, but only when someone opens it.
  It should run headless on every push next to the Node tests, so a CSS change cannot break the
  phone frame without anyone noticing.
- Make the brief data instead of code. Each requirement is a JavaScript function (`met(spec)`),
  so adding a second level means writing code. Simple rules like "field.phone must be true" would
  let a level be written as content and checked before it loads.

## Run it locally

Clone the repo and open `index.html` in a current browser. There is no build step, no server and
no dependencies.

## Credits

The typeface is [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next),
used under the SIL Open Font License (`fonts/OFL.txt`).
