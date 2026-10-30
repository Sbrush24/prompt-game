/* Kids build output: one game screen, the game Bolt built, the build animation, and what Bolt
   says about it. Same contract as js/renderer.js (mount -> build, refit, markLines), so main.js
   drives either one. The game is drawn from the build spec alone, as inline SVG: what the
   player looks at is exactly what the grader checks. */
(function (PG) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const W = 480;
  const H = 320;
  const FLOOR = 272; // where the hero stands
  const COLUMNS = [60, 150, 240, 330, 420]; // where things fall

  // How long one thing takes to fall, by speed. The sign on screen says the speed too, so a
  // player who has motion turned off can still judge it.
  const FALL_S = { slow: 5.5, normal: 3.2, fast: 1.9, turbo: 0.9 };

  const BUILD_MS = 3000;
  const READ_MS = 450;
  const SETTLE_MS = 300;

  const INK = '#1d2433';

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    node.append(...children);
    return node;
  }

  const outlined = (attrs) => ({ stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round', ...attrs });

  // Each sprite is drawn around (0, 0), about 56 units across.
  const SPRITES = {
    robot: () => [
      svg('line', outlined({ x1: 0, y1: -30, x2: 0, y2: -42 })),
      svg('circle', outlined({ cx: 0, cy: -45, r: 5, fill: '#ff5a4e' })),
      svg('rect', outlined({ x: -24, y: -30, width: 48, height: 44, rx: 9, fill: '#b9c6d2' })),
      svg('circle', outlined({ cx: -10, cy: -12, r: 7, fill: '#ffffff' })),
      svg('circle', outlined({ cx: 10, cy: -12, r: 7, fill: '#ffffff' })),
      svg('circle', { cx: -9, cy: -11, r: 3, fill: INK }),
      svg('circle', { cx: 11, cy: -11, r: 3, fill: INK }),
      svg('rect', outlined({ x: -10, y: 2, width: 20, height: 6, rx: 3, fill: '#6fd3ff', 'stroke-width': 2 })),
    ],
    cat: () => [
      svg('path', outlined({ d: 'M-22 -10 L-18 -38 L-4 -22 Z', fill: '#f4a340' })),
      svg('path', outlined({ d: 'M22 -10 L18 -38 L4 -22 Z', fill: '#f4a340' })),
      svg('circle', outlined({ cx: 0, cy: -6, r: 24, fill: '#f4a340' })),
      svg('circle', { cx: -9, cy: -10, r: 3.5, fill: INK }),
      svg('circle', { cx: 9, cy: -10, r: 3.5, fill: INK }),
      svg('path', { d: 'M-4 0 L4 0 L0 5 Z', fill: '#ff7aa8', stroke: INK, 'stroke-width': 1.5 }),
      svg('path', { d: 'M-30 2 L-12 4 M-30 9 L-12 7 M30 2 L12 4 M30 9 L12 7', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ],
    dog: () => [
      svg('circle', outlined({ cx: 0, cy: -6, r: 24, fill: '#c98b55' })),
      svg('ellipse', outlined({ cx: -24, cy: -4, rx: 8, ry: 16, fill: '#7a4a2a' })),
      svg('ellipse', outlined({ cx: 24, cy: -4, rx: 8, ry: 16, fill: '#7a4a2a' })),
      svg('circle', { cx: -9, cy: -12, r: 3.5, fill: INK }),
      svg('circle', { cx: 9, cy: -12, r: 3.5, fill: INK }),
      svg('ellipse', { cx: 0, cy: -1, rx: 6, ry: 4.5, fill: INK }),
      svg('path', outlined({ d: 'M-4 7 Q0 18 4 7 Z', fill: '#ff7aa8', 'stroke-width': 2 })),
    ],
    coin: () => [
      svg('circle', outlined({ r: 13, fill: '#ffd23f' })),
      svg('circle', { r: 7, fill: 'none', stroke: '#b8860b', 'stroke-width': 2.5 }),
    ],
    fish: () => [
      svg('path', outlined({ d: 'M12 0 L26 -10 L26 10 Z', fill: '#2f8fe0' })),
      svg('ellipse', outlined({ cx: 0, cy: 0, rx: 16, ry: 10, fill: '#55b6ff' })),
      svg('circle', { cx: -8, cy: -2, r: 2.5, fill: INK }),
    ],
    bone: () => [
      svg('path', outlined({
        d: 'M-12 -4 H12 A6 6 0 1 1 16 -10 A6 6 0 1 1 16 10 A6 6 0 1 1 12 4 H-12 A6 6 0 1 1 -16 10 A6 6 0 1 1 -16 -10 A6 6 0 1 1 -12 -4 Z',
        fill: '#fff6e0',
      })),
    ],
  };

  function sprite(name, x, y, className) {
    return svg('g', { class: className, transform: `translate(${x} ${y})` }, SPRITES[name]());
  }

  // The game itself, in the order Bolt builds it. Each part is wrapped in its own group, so
  // the reveal can fade it without touching the sprite's own position.
  function scene(level, spec) {
    const parts = [];
    const part = (step, children) => {
      const g = svg('g', { class: 'part' }, children);
      g.dataset.step = step;
      parts.push(g);
      return g;
    };

    const lava = spec.world === 'lava';
    const world = part('Painting the world', [
      svg('rect', { width: W, height: H, fill: lava ? '#4a1424' : '#a8e4ff' }),
      lava
        ? svg('circle', { cx: 240, cy: 56, r: 22, fill: '#ff9a3d', opacity: 0.5 })
        : svg('circle', outlined({ cx: 240, cy: 50, r: 22, fill: '#ffe066' })),
      svg('path', outlined({
        d: `M-4 ${FLOOR + 14} Q120 ${FLOOR - 4} 240 ${FLOOR + 10} T484 ${FLOOR + 6} V${H + 4} H-4 Z`,
        fill: lava ? '#ff6a1a' : '#6cc36a',
      })),
      ...(lava ? [
        svg('circle', outlined({ cx: 90, cy: FLOOR + 30, r: 6, fill: '#ffb23d', 'stroke-width': 2 })),
        svg('circle', outlined({ cx: 300, cy: FLOOR + 36, r: 8, fill: '#ffb23d', 'stroke-width': 2 })),
      ] : [
        svg('circle', { cx: 70, cy: FLOOR + 28, r: 5, fill: '#ff7aa8' }),
        svg('circle', { cx: 360, cy: FLOOR + 34, r: 5, fill: '#ffffff' }),
      ]),
    ]);

    const hero = part(`Drawing the ${level.heroes[spec.hero]}`, [
      svg('g', { class: 'hero' }, [sprite(spec.hero, W / 2, FLOOR - 14)]),
    ]);

    const fall = FALL_S[spec.speed];
    const falling = COLUMNS.map((x, i) => {
      const g = svg('g', { class: 'faller' }, [sprite(spec.thing, x, 0)]);
      g.style.setProperty('--fall', `${fall}s`);
      g.style.setProperty('--delay', `${-((i * 0.37) % 1) * fall}s`); // already mid-fall, staggered
      g.style.setProperty('--rest', `${70 + ((i * 53) % 150)}px`); // where it hangs with motion off
      return g;
    });
    part(`Dropping in ${level.things[spec.thing]}`, falling);

    if (spec.score) {
      part('Adding the score', [
        svg('rect', outlined({ x: 12, y: 12, width: 136, height: 42, rx: 21, fill: '#ffffff' })),
        text('Score: 12', 80, 41, { 'font-size': 22 }),
      ]);
    }

    const speedName = level.speeds[spec.speed];
    part(`Setting the speed to ${speedName}`, [
      svg('rect', outlined({ x: W - 192, y: 12, width: 180, height: 42, rx: 10, fill: spec.speed === 'turbo' ? '#ff5a4e' : '#ffffff' })),
      text(`Speed: ${speedName}`, W - 102, 41, { 'font-size': 21, fill: spec.speed === 'turbo' ? '#ffffff' : INK }),
    ]);

    const label = `A ${level.heroes[spec.hero]} catches falling ${level.things[spec.thing]} ${lava ? 'over lava' : 'in a meadow'}. `
      + `Speed: ${speedName}. ${spec.score ? 'The score shows at the top.' : 'There is no score.'}`;
    const art = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, class: 'game-art' },
      [world, hero, ...parts.slice(2)]);
    const game = document.createElement('div');
    game.className = `game speed--${spec.speed}`;
    game.append(art);
    return { game, parts };
  }

  function text(words, x, y, attrs = {}) {
    const node = svg('text', { x, y, 'text-anchor': 'middle', 'font-weight': 800, fill: INK, ...attrs });
    node.textContent = words;
    return node;
  }

  // Bolt, the AI: always cheerful, always sure.
  function boltFace() {
    return svg('svg', { viewBox: '-30 -50 60 70', class: 'bolt-face', 'aria-hidden': 'true' }, SPRITES.robot());
  }

  // ---------------------------------------------------------------------------
  // The output pane
  // ---------------------------------------------------------------------------

  function mount(root, level) {
    const { el } = PG.dom;
    root.dataset.layout = 'single';

    const status = el('div', 'build-status');
    const step = el('p', 'build-step');
    const track = el('div', 'build-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Build progress');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    const fill = el('span', 'build-fill');
    track.append(fill);
    status.append(step, track);

    const screen = el('figure', 'arcade');
    const viewport = el('div', 'arcade-screen');
    viewport.append(el('p', 'viewport-empty', 'Nothing built yet'));
    screen.append(viewport, el('figcaption', 'frame-caption', 'Game screen'));

    const assistant = el('div', 'assistant');
    const you = el('div', 'exchange exchange--you');
    you.hidden = true;
    const youSaid = el('p', 'said');
    you.append(el('p', 'who', 'You said'), youSaid);
    const ai = el('div', 'exchange exchange--ai');
    const aiSaid = el('div', 'said');
    aiSaid.setAttribute('aria-live', 'polite');
    aiSaid.append(el('p', 'said-idle', 'Snap your blocks together below, then press Go!'));
    const who = el('p', 'who');
    who.append(boltFace(), 'Bolt the AI');
    ai.append(who, aiSaid);
    assistant.append(you, ai);

    root.replaceChildren(status, screen, assistant);

    let timers = [];

    function setProgress(label, percent) {
      step.textContent = label;
      track.setAttribute('aria-valuenow', String(Math.round(percent)));
      fill.style.setProperty('--p', String(percent / 100));
    }

    function cancel() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    }

    // Draw the game for `spec` and reveal it part by part. Resolves once the game is finished
    // and Bolt has had his say. A build cut short by another build() never resolves.
    function build(spec, { prompt, report }) {
      cancel();
      const { game, parts } = scene(level, spec);
      game.classList.add('is-building');
      viewport.replaceChildren(game);

      root.setAttribute('aria-busy', 'true');
      youSaid.textContent = `“${prompt}”`;
      you.hidden = false;
      const reserve = el('div', 'said-reserve');
      reserve.append(...reportNodes(el, report));
      aiSaid.setAttribute('aria-live', 'polite');
      aiSaid.replaceChildren(el('p', 'said-idle said-building', 'Building…'), reserve);
      fill.style.transition = 'none';
      setProgress('Reading your blocks', 0);
      fill.getBoundingClientRect();
      fill.style.transition = '';

      const each = (BUILD_MS - READ_MS - SETTLE_MS) / parts.length;
      return new Promise((resolve) => {
        const later = (ms, fn) => timers.push(window.setTimeout(fn, ms));
        later(0, () => setProgress('Reading your blocks', 6));
        parts.forEach((p, i) => {
          later(READ_MS + i * each, () => {
            p.classList.add('is-in');
            setProgress(p.dataset.step, 6 + (88 * (i + 1)) / parts.length);
          });
        });
        later(BUILD_MS, () => {
          timers = [];
          game.classList.remove('is-building');
          setProgress(report.opener, 100);
          aiSaid.replaceChildren(...reportNodes(el, report));
          root.removeAttribute('aria-busy');
          resolve();
        });
      });
    }

    return {
      viewports: { game: viewport },
      build,
      refit() {}, // the game screen sizes itself to the pane
      // Mark the lines behind missed wishes: where Bolt's own idea stood.
      markLines(ids) {
        aiSaid.setAttribute('aria-live', 'off');
        for (const line of aiSaid.querySelectorAll('.report-line')) {
          const behind = ids.includes(line.dataset.line);
          line.classList.toggle('is-blamed', behind);
          const note = line.querySelector('.report-behind');
          if (behind && !note) line.prepend(el('span', 'report-behind visually-hidden', 'Behind a wish that did not come true: '));
          if (!behind && note) note.remove();
        }
      },
    };
  }

  function reportNodes(el, report) {
    const list = el('ul', 'report');
    for (const line of report.lines) {
      const item = el('li', 'report-line', line.text);
      item.dataset.line = line.id;
      list.append(item);
    }
    return [el('p', 'report-opener', report.opener), list, el('p', 'report-closer', report.closer)];
  }

  PG.Renderer = { mount, scene, FALL_S };
})(globalThis.PG = globalThis.PG || {});
