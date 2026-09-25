/* Boot. Owns the game phase and the loop around it:
     compose  -> the player places chips and presses Run
     building -> the simulated AI builds; nothing can be changed
     review   -> the player ticks what they think the build does, then presses Check
     result   -> the truth is revealed, the chips and report lines behind each miss are
                 marked, and the builder is open again: Retry, or just change a chip.
   The whole loop runs in well under ten seconds of the game's own time. */
(function (PG) {
  'use strict';

  const level = PG.Interpreter.validateLevel(PG.levels.level1); // a typo in the level data stops here, not mid-game
  const app = document.querySelector('.app');

  document.getElementById('level-number').textContent = `Level ${level.number}`;
  document.getElementById('level-title').textContent = level.title;

  const rootStyle = document.documentElement.style;
  const pinned = (edge) => parseFloat(rootStyle.getPropertyValue(`--pinned-${edge}`)) || 0;

  const brief = PG.Review.mountBrief(document.getElementById('brief-body'), level, { onCheck: check, onRetry: retry });
  const output = PG.Renderer.mount(document.getElementById('output-body'), level, { topInset: () => pinned('top') });
  const builder = PG.Builder.mount(document.getElementById('builder-body'), level, { onRun: run, onChange: changed });

  app.dataset.phase = 'compose';
  let current = null; // the build being reviewed: { result, report, placed }

  // A held Enter repeats, and each repeat clicks whatever button has focus by then. One press
  // is one action: not Run and then another over its report, nor Check, then Retry, then a
  // chip taken out and put back as focus moves on.
  document.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ') && event.target.closest('button')) {
      event.preventDefault();
    }
  }, true);

  function run() {
    if (app.dataset.phase === 'building' || app.dataset.phase === 'review') return;
    // Everything that can go wrong happens before the builder locks.
    const placed = builder.placed();
    const result = PG.Interpreter.interpret(level, placed);
    const prompt = PG.Interpreter.promptText(level, placed);
    const report = PG.Interpreter.report(level, result);

    current = { result, report, placed };
    const runHadFocus = document.activeElement === document.querySelector('.run');
    app.dataset.phase = 'building';
    app.dataset.built = 'true';
    builder.setLocked(true, 'Building…');
    builder.setBlame({});
    brief.startBuild();
    measurePinned(); // the brief just grew its checkboxes; size the frames to what is left
    let building;
    try {
      building = output.build(result.spec, { prompt, report }); // resizes the frames for the first build
    } catch (error) {
      building = Promise.reject(error);
    }
    bringOutputIntoView();

    building.then(() => {
      app.dataset.phase = 'review';
      builder.setLocked(true, 'Check the brief first');
      brief.startReview(result);
      if (runHadFocus) brief.focusFirstBox(); // keyboard: straight on to the next step
    }, (error) => {
      console.error(error);
      app.dataset.phase = 'compose';
      builder.setLocked(false);
      brief.reset();
    });
  }

  // Check pressed: the brief shows the truth; mark what is behind each miss.
  function check() {
    const { result, report } = current;
    const byChip = {};
    const lines = [];
    for (const { id, chips, lines: own } of PG.Interpreter.blame(level, result, report)) {
      const text = level.requirements.find((r) => r.id === id).text;
      for (const chip of chips) (byChip[chip] = byChip[chip] || []).push(text);
      lines.push(...own);
    }
    builder.setBlame(byChip);
    output.markLines(lines);
    app.dataset.phase = 'result';
    builder.setLocked(false);
    measurePinned();
    // The revealed brief may be too tall to stay pinned. Stacked, bring the brief into view;
    // wide, where it is taller than the window, bring its verdict and Retry into view.
    if (briefPane.classList.contains('is-too-tall')) {
      if (besideOutput()) briefPane.querySelector('.brief-footer').scrollIntoView({ block: 'nearest' });
      else briefPane.scrollIntoView({ block: 'start' });
    }
  }

  // Retry: same chips, back to the builder, with the brief's marks cleared. The chips and report
  // lines behind each miss stay marked until they change or the next Run.
  function retry() {
    app.dataset.phase = 'compose';
    brief.reset();
    measurePinned();
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.pane--builder').scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    builder.focusPrompt();
  }

  // Changing a chip after the reveal is a retry too. A move that leaves the prompt as it was
  // (a chip dragged to the empty socket beside it) keeps the reveal.
  function changed() {
    if (app.dataset.phase !== 'result') return;
    if (builder.placed().join() === current.placed.join()) return;
    app.dataset.phase = 'compose';
    brief.reset();
    measurePinned();
  }

  // Run can sit below the output (always on narrow screens), so the build would happen off
  // screen. Scroll as little as possible to show the progress line, the frames and the room held
  // for the AI's report, and Run too when it all fits, so a retry is one click away. Stacked,
  // the report comes after the phone and cannot fit as well: show the line and the phone's page.
  function bringOutputIntoView() {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const { phone } = PG.Renderer.DEVICES;
    const top = rect('.build-status').top;
    const screen = rect('.viewport--phone');
    const report = rect('.exchange--ai').bottom;
    const ends = document.getElementById('output-body').dataset.layout === 'stack'
      ? [screen.top + (screen.height * phone.page) / phone.height]
      : [Math.max(report, rect('.run-area').bottom), report];
    const first = pinned('top') + 10;
    const last = window.innerHeight - 10; // the pinned Run bar never overlaps the output
    const bottom = ends.find((end) => end - top <= last - first);
    let by = top - first; // too tall to show at once: start from the progress line
    if (bottom !== undefined) {
      if (top >= first && bottom <= last) return;
      by = top < first ? top - first : bottom - last;
    }
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Publish the heights of whichever bars are pinned, for the scroll-padding in styles.css,
  // so keyboard focus never lands hidden underneath them. Wide, the brief is pinned in its own
  // column beside everything else, so it covers nothing at the top; it unpins only when it is
  // taller than the window, since a pinned brief would then hide its own foot.
  const briefPane = document.querySelector('.pane--brief');
  const outputPane = document.querySelector('.pane--output');
  const runArea = document.querySelector('.run-area');
  const pinnedHeight = (el) => (getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0);
  const besideOutput = () => briefPane.getBoundingClientRect().right <= outputPane.getBoundingClientRect().left;
  const measurePinned = () => {
    const tooTall = besideOutput()
      ? (parseFloat(getComputedStyle(briefPane).top) || 0) + briefPane.offsetHeight > window.innerHeight
      : briefPane.offsetHeight > window.innerHeight * 0.55;
    briefPane.classList.toggle('is-too-tall', tooTall);
    rootStyle.setProperty('--pinned-top', `${besideOutput() ? 0 : pinnedHeight(briefPane)}px`);
    rootStyle.setProperty('--pinned-bottom', `${pinnedHeight(runArea)}px`);
    output.refit(); // stacked, the phone frame is sized to fit under the pinned brief
  };
  const pinnedObserver = new ResizeObserver(measurePinned);
  for (const el of [document.body, briefPane, runArea]) pinnedObserver.observe(el);
  window.addEventListener('resize', measurePinned); // height-only changes can pin or unpin a bar
  measurePinned();
})(globalThis.PG = globalThis.PG || {});
