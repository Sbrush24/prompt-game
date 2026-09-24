/* Build output: a desktop browser frame and a phone frame, the page the simulated AI built,
   the build animation, and what the AI says about it.
   Each viewport has a real CSS pixel width, and the whole frame is scaled to fit the pane.
   So a layout that is too wide for a phone is actually too wide in the phone frame,
   not just drawn that way. The page is drawn from the build spec alone: the renderer never
   sees the prompt, so what the player looks at is exactly what the grader checks. */
(function (PG) {
  'use strict';

  const DEVICES = {
    desktop: { width: 880, height: 540, bar: 36 },
    // `page`: no build draws below this, so that much of the phone screen is all that must be seen.
    phone: { width: 360, height: 640, bezel: 10, page: 560 },
  };
  const GAP = 20; // matches .frames column-gap
  const MIN_SHARED_SCALE = 0.6; // side by side below this, the page's text gets too small to judge, so stack
  // Stacked, the progress line and the built page share the screen with whatever is pinned at
  // the top. This is everything else on it: the progress line (36px), the gap under it (16px),
  // and the 10px margins main.js bringOutputIntoView keeps above and below. The blank foot of
  // the phone screen and its caption may run on below the fold.
  const STACK_RESERVE = 74;

  // The build: a moment reading the prompt, the page's parts arriving one at a time, then a
  // beat with the finished page before the AI reports. Kept short so a retry stays cheap.
  const BUILD_MS = 3600;
  const READ_MS = 500;
  const SETTLE_MS = 300;

  // ---------------------------------------------------------------------------
  // The page itself
  // ---------------------------------------------------------------------------

  // Everything the animation reveals is a "part", in the order it is built, with the words
  // the progress line shows while it goes in.
  function page(level, spec) {
    const { el } = PG.dom;
    const parts = [];
    const part = (node, step) => {
      node.classList.add('part');
      node.dataset.step = step;
      parts.push(node);
      return node;
    };

    const site = el('div', `site theme--${spec.theme} layout--${spec.layout}`);

    const header = part(el('header', 'site-header'), 'Adding the site header');
    const bar = el('div', 'site-bar');
    const nav = el('span', 'site-nav');
    for (const item of level.site.nav) nav.append(el('span', 'site-link', item));
    const menu = el('span', 'site-menu', 'Menu');
    bar.append(el('span', 'site-logo', level.site.name), nav, menu);
    header.append(bar);

    const main = el('div', 'site-main');
    if (spec.layout === 'hero-split') {
      const hero = part(el('div', 'hero'), 'Adding a hero image');
      hero.append(el('span', 'hero-tagline', level.site.tagline));
      main.append(hero);
    }

    const form = el('div', 'site-form');
    form.append(part(el('p', 'form-heading', spec.heading), 'Writing the heading'));
    if (spec.validation) {
      form.append(part(el('p', 'form-note', '* Required'), 'Adding field checks'));
    }

    const fields = el('div', 'form-fields');
    for (const field of level.formFields) {
      if (!spec[field.prop]) continue;
      const row = part(el('div', `field${field.multiline ? ' field--multiline' : ''}`), `Adding the ${field.label.toLowerCase()} field`);
      row.dataset.field = field.prop;
      row.append(
        el('span', 'field-label', spec.validation ? `${field.label} *` : field.label),
        el('span', `field-box${field.secret ? ' field-box--secret' : ''}`),
      );
      fields.append(row);
    }
    form.append(fields);

    const actions = el('div', 'form-actions');
    actions.append(part(el('span', 'form-button', spec.submitLabel), 'Adding the button'));
    form.append(actions);

    main.append(form);
    site.append(header, main);
    return { site, parts };
  }

  // ---------------------------------------------------------------------------
  // The output pane
  // ---------------------------------------------------------------------------

  // `topInset` reports how much of the top of the screen is covered by pinned bars.
  function mount(root, level, { topInset = () => 0 } = {}) {
    const { el } = PG.dom;

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

    const frames = el('div', 'frames');
    const desktop = buildDesktopFrame(el, level);
    const phone = buildPhoneFrame(el);
    frames.append(desktop.figure, phone.figure);

    const assistant = el('div', 'assistant');
    const you = el('div', 'exchange exchange--you');
    you.hidden = true;
    const youSaid = el('p', 'said');
    you.append(el('p', 'who', 'You'), youSaid);
    const ai = el('div', 'exchange exchange--ai');
    const aiSaid = el('div', 'said');
    aiSaid.setAttribute('aria-live', 'polite');
    aiSaid.append(el('p', 'said-idle', 'Nothing built yet. Fill in the slots below and press Run.'));
    ai.append(el('p', 'who', 'Assistant'), aiSaid);
    assistant.append(you, ai);

    root.replaceChildren(status, frames, assistant);
    showEmpty([desktop.viewport, phone.viewport], el);

    const outer = {
      desktop: { w: DEVICES.desktop.width, h: DEVICES.desktop.height + DEVICES.desktop.bar },
      phone: { w: DEVICES.phone.width + 2 * DEVICES.phone.bezel, h: DEVICES.phone.height + 2 * DEVICES.phone.bezel },
    };
    let lastKey = '';
    let built = false; // until the first build the frames stay small, so the builder is in view

    function fit() {
      const width = root.clientWidth;
      // Never taller than the room under a brief pinned above (phone landscape), down to 264px.
      const underBrief = window.innerHeight - topInset() - 64;
      const maxHeight = built
        ? Math.max(264, Math.min(560, window.innerHeight * 0.6, underBrief))
        : Math.max(264, Math.min(520, window.innerHeight * 0.5, underBrief));
      const tallest = Math.max(outer.desktop.h, outer.phone.h);
      const byWidth = (width - GAP) / (outer.desktop.w + outer.phone.w);
      const byHeight = maxHeight / tallest;

      let layout;
      let desktopScale;
      let phoneScale;
      if (byWidth >= Math.min(MIN_SHARED_SCALE, byHeight)) {
        // Side by side, as large as the pane allows. A short window can still shrink them:
        // stacking would not help there, since it is the height that runs out.
        layout = 'side';
        desktopScale = phoneScale = Math.min(1, byWidth, byHeight);
      } else {
        // Too narrow for both at a readable size. Leave room for the pinned brief above, so
        // it and the phone stay in view together while the player checks.
        layout = 'stack';
        const room = Math.max(260, window.innerHeight - topInset() - STACK_RESERVE);
        phoneScale = Math.min(1, width / outer.phone.w, room / (DEVICES.phone.page + DEVICES.phone.bezel));
        desktopScale = Math.min(1, width / outer.desktop.w);
      }

      const key = `${layout}:${desktopScale.toFixed(4)}:${phoneScale.toFixed(4)}`;
      if (key === lastKey) return;
      lastKey = key;
      root.dataset.layout = layout;
      setScale(desktop.figure, outer.desktop, desktopScale);
      setScale(phone.figure, outer.phone, phoneScale);
    }

    new ResizeObserver(fit).observe(root);
    window.addEventListener('resize', fit);
    fit();

    let timers = [];

    function setProgress(label, percent) {
      step.textContent = label;
      track.setAttribute('aria-valuenow', String(Math.round(percent)));
      fill.style.setProperty('--p', String(percent / 100));
    }

    // Draw the page for `spec` in both frames and reveal it part by part. Resolves once the
    // page is finished and the AI has said its piece. A build cut short by another build()
    // never resolves, so whatever was waiting on it (main.js reopening the builder) is dropped.
    function build(spec, { prompt, report }) {
      cancel();
      built = true;
      fit();
      const pages = [page(level, spec), page(level, spec)];
      const [onDesktop, onPhone] = pages;
      for (const p of pages) p.site.classList.add('is-building');
      onPhone.site.setAttribute('aria-hidden', 'true'); // the same page twice; screen readers get it once
      desktop.viewport.replaceChildren(onDesktop.site);
      phone.viewport.replaceChildren(onPhone.site);
      // The parts are laid out already, just not shown, so the phone can show from the start
      // whether the page is wider than it is.
      const cut = cutOff(phone.viewport);
      phone.showWider(cut.right);
      phone.note.textContent = '';

      root.setAttribute('aria-busy', 'true');
      youSaid.textContent = `“${prompt}”`;
      you.hidden = false;
      // An invisible copy of the report holds its room while it is being written, so nothing
      // below it jumps when it lands. Hidden text is neither read out nor found by search.
      const reserve = el('div', 'said-reserve');
      reserve.append(...reportNodes(el, report));
      aiSaid.replaceChildren(el('p', 'said-idle said-building', 'Building…'), reserve);
      // Back to empty at once: a bar sliding back from the last build would read as undoing work.
      fill.style.transition = 'none';
      setProgress('Reading your prompt', 0);
      fill.getBoundingClientRect();
      fill.style.transition = '';

      const count = onDesktop.parts.length;
      const each = (BUILD_MS - READ_MS - SETTLE_MS) / count;
      return new Promise((resolve) => {
        const later = (ms, fn) => timers.push(window.setTimeout(fn, ms));
        later(0, () => setProgress('Reading your prompt', 6));
        onDesktop.parts.forEach((first, i) => {
          later(READ_MS + i * each, () => {
            for (const p of pages) p.parts[i].classList.add('is-in');
            setProgress(first.dataset.step, 6 + (88 * (i + 1)) / count);
          });
        });
        later(BUILD_MS, () => {
          timers = [];
          for (const p of pages) p.site.classList.remove('is-building');
          setProgress(report.opener, 100); // the AI's verdict, where the player is already looking
          phone.note.textContent = cut.right ? ', the page is wider than the screen, so its right side is cut off'
            : cut.bottom ? ', the page is taller than the screen, so its bottom is cut off'
            : ', the whole page fits on the screen';
          aiSaid.replaceChildren(...reportNodes(el, report));
          root.removeAttribute('aria-busy');
          resolve();
        });
      });
    }

    function cancel() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    }

    return {
      viewports: { desktop: desktop.viewport, phone: phone.viewport },
      build,
      refit: fit, // call when the pinned bars change height
      // Mark the report lines behind missed brief items: where the AI's own default stood.
      markLines(ids) {
        for (const line of aiSaid.querySelectorAll('.report-line')) {
          const behind = ids.includes(line.dataset.line);
          line.classList.toggle('is-blamed', behind);
          const note = line.querySelector('.report-behind');
          if (behind && !note) line.prepend(el('span', 'report-behind visually-hidden', 'Behind a miss: '));
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

  // Which edges of the viewport the page runs past.
  function cutOff(viewport) {
    return {
      right: viewport.scrollWidth > viewport.clientWidth + 1,
      bottom: viewport.scrollHeight > viewport.clientHeight + 1,
    };
  }

  function setScale(figure, size, scale) {
    figure.style.setProperty('--s', scale.toFixed(4));
    figure.style.setProperty('--fw', String(size.w));
    figure.style.setProperty('--fh', String(size.h));
  }

  function buildDesktopFrame(el, level) {
    const figure = el('figure', 'frame frame--desktop');
    const box = el('div', 'frame-box');
    const scaler = el('div', 'frame-scaler');
    const bar = el('div', 'browser-bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.append(el('span', 'browser-address', level.site.address));
    const viewport = el('div', 'viewport viewport--desktop');
    viewport.style.width = `${DEVICES.desktop.width}px`;
    viewport.style.height = `${DEVICES.desktop.height}px`;
    scaler.append(bar, viewport);
    box.append(scaler);
    figure.append(box, el('figcaption', 'frame-caption', 'Desktop'));
    return { figure, viewport };
  }

  function buildPhoneFrame(el) {
    const figure = el('figure', 'frame frame--phone');
    const box = el('div', 'frame-box');
    const scaler = el('div', 'frame-scaler phone-body');
    const viewport = el('div', 'viewport viewport--phone');
    viewport.style.width = `${DEVICES.phone.width}px`;
    viewport.style.height = `${DEVICES.phone.height}px`;
    // A page wider than the phone scrolls sideways, as it would in a phone browser. The cue
    // over the screen (a shadow on the cut edge and a scroll bar) says there is more to see.
    const cue = el('span', 'phone-cue');
    cue.setAttribute('aria-hidden', 'true');
    const followScroll = () => cue.style.setProperty('--at', String(viewport.scrollLeft / viewport.scrollWidth));
    viewport.addEventListener('scroll', followScroll, { passive: true });
    scaler.append(viewport, cue);
    box.append(scaler);
    const caption = el('figcaption', 'frame-caption', 'Phone');
    // What a sighted player sees at a glance in the phone frame, for screen readers.
    const note = el('span', 'visually-hidden');
    caption.append(note);
    figure.append(box, caption);

    function showWider(wider) {
      viewport.scrollLeft = 0;
      figure.classList.toggle('is-wider', wider);
      cue.style.setProperty('--seen', String(viewport.clientWidth / viewport.scrollWidth));
      followScroll();
      // Something that scrolls must be reachable from the keyboard.
      if (wider) {
        viewport.tabIndex = 0;
        viewport.setAttribute('role', 'group');
        viewport.setAttribute('aria-label', 'Phone screen, scrolls sideways');
      } else {
        viewport.removeAttribute('tabindex');
        viewport.removeAttribute('role');
        viewport.removeAttribute('aria-label');
      }
    }
    return { figure, viewport, note, showWider };
  }

  function showEmpty(viewports, el) {
    for (const viewport of viewports) {
      viewport.replaceChildren(el('p', 'viewport-empty', 'Nothing built yet'));
    }
  }

  PG.Renderer = { mount, page, DEVICES };
})(globalThis.PG = globalThis.PG || {});
