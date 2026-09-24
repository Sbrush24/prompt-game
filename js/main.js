/* Boot. Owns the game phase: compose -> building -> review -> result.
   Pass 3 runs compose -> building -> review; the review itself (marking the brief,
   the reveal and retry) arrives in pass 4, so for now the builder reopens after a build. */
(function (PG) {
  'use strict';

  const level = PG.Interpreter.validateLevel(PG.levels.level1); // a typo in the level data stops here, not mid-game
  const app = document.querySelector('.app');

  document.getElementById('level-number').textContent = `Level ${level.number}`;
  document.getElementById('level-title').textContent = level.title;

  const rootStyle = document.documentElement.style;
  const pinned = (edge) => parseFloat(rootStyle.getPropertyValue(`--pinned-${edge}`)) || 0;

  PG.Review.mountBrief(document.getElementById('brief-body'), level);
  const output = PG.Renderer.mount(document.getElementById('output-body'), level, { topInset: () => pinned('top') });
  const builder = PG.Builder.mount(document.getElementById('builder-body'), level, { onRun: run });

  app.dataset.phase = 'compose';

  function run() {
    if (app.dataset.phase === 'building') return;
    // Everything that can go wrong happens before the builder locks.
    const placed = builder.placed();
    const result = PG.Interpreter.interpret(level, placed);
    const prompt = PG.Interpreter.promptText(level, placed);
    const report = PG.Interpreter.report(level, result);

    app.dataset.phase = 'building';
    app.dataset.built = 'true';
    builder.setLocked(true, 'Building…');
    let building;
    try {
      building = output.build(result.spec, { prompt, report }); // resizes the frames for the first build
    } catch (error) {
      building = Promise.reject(error);
    }
    bringOutputIntoView();

    building
      .catch((error) => console.error(error))
      .finally(() => {
        app.dataset.phase = 'review';
        builder.setLocked(false);
      });
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
  // column beside everything else, so it covers nothing at the top.
  const briefPane = document.querySelector('.pane--brief');
  const outputPane = document.querySelector('.pane--output');
  const runArea = document.querySelector('.run-area');
  const pinnedHeight = (el) => (getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0);
  const besideOutput = () => briefPane.getBoundingClientRect().right <= outputPane.getBoundingClientRect().left;
  const measurePinned = () => {
    rootStyle.setProperty('--pinned-top', `${besideOutput() ? 0 : pinnedHeight(briefPane)}px`);
    rootStyle.setProperty('--pinned-bottom', `${pinnedHeight(runArea)}px`);
    output.refit(); // stacked, the phone frame is sized to fit under the pinned brief
  };
  const pinnedObserver = new ResizeObserver(measurePinned);
  for (const el of [document.body, briefPane, runArea]) pinnedObserver.observe(el);
  window.addEventListener('resize', measurePinned); // height-only changes can pin or unpin a bar
  measurePinned();
})(globalThis.PG = globalThis.PG || {});
