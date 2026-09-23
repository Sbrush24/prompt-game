/* Boot. Owns the game phase: compose -> building -> review -> result.
   Pass 2 only has compose; Run is wired to the simulated AI in pass 3. */
(function (PG) {
  'use strict';

  const level = PG.levels.level1;
  const app = document.querySelector('.app');

  document.getElementById('level-number').textContent = `Level ${level.number}`;
  document.getElementById('level-title').textContent = level.title;

  PG.Review.mountBrief(document.getElementById('brief-body'), level);
  PG.Renderer.mount(document.getElementById('output-body'), level);
  PG.Builder.mount(document.getElementById('builder-body'), level, {
    onRun() {
      // Pass 3: interpret the placed fragments, animate the build, render the result.
    },
  });

  app.dataset.phase = 'compose';

  // Publish the heights of whichever bars are pinned, for the scroll-padding in styles.css,
  // so keyboard focus never lands hidden underneath them.
  const briefPane = document.querySelector('.pane--brief');
  const runArea = document.querySelector('.run-area');
  const rootStyle = document.documentElement.style;
  const pinnedHeight = (el) => (getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0);
  const measurePinned = () => {
    rootStyle.setProperty('--pinned-top', `${pinnedHeight(briefPane)}px`);
    rootStyle.setProperty('--pinned-bottom', `${pinnedHeight(runArea)}px`);
  };
  const pinnedObserver = new ResizeObserver(measurePinned);
  for (const el of [document.body, briefPane, runArea]) pinnedObserver.observe(el);
  window.addEventListener('resize', measurePinned); // height-only changes can pin or unpin a bar
  measurePinned();
})(globalThis.PG = globalThis.PG || {});
