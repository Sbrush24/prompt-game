/* Build output: a desktop browser frame and a phone frame.
   Each viewport has a real CSS pixel width, and the whole frame is scaled to fit the pane.
   So a layout that is too wide for a phone is actually too wide in the phone frame,
   not just drawn that way. The build animation and the mock form arrive in pass 3. */
(function (PG) {
  'use strict';

  const DEVICES = {
    desktop: { width: 880, height: 540, bar: 36 },
    phone: { width: 360, height: 640, bezel: 10 },
  };
  const GAP = 20; // matches .frames column-gap
  const MIN_SHARED_SCALE = 0.6; // below this the phone text gets too small to judge, so the phone gets priority
  const MIN_SIDE_BY_SIDE = 520; // narrower than this, stack the frames with the phone first

  function mount(root) {
    const { el } = PG.dom;

    const frames = el('div', 'frames');
    const desktop = buildDesktopFrame(el);
    const phone = buildPhoneFrame(el);
    frames.append(desktop.figure, phone.figure);

    const assistant = el('div', 'assistant');
    const who = el('p', 'assistant-who', 'Assistant');
    const message = el('p', 'assistant-message', 'Nothing built yet. Fill in the slots below and press Run.');
    assistant.append(who, message);

    root.replaceChildren(frames, assistant);
    showEmpty([desktop.viewport, phone.viewport], el);

    const outer = {
      desktop: { w: DEVICES.desktop.width, h: DEVICES.desktop.height + DEVICES.desktop.bar },
      phone: { w: DEVICES.phone.width + 2 * DEVICES.phone.bezel, h: DEVICES.phone.height + 2 * DEVICES.phone.bezel },
    };
    let lastKey = '';

    function fit() {
      const width = root.clientWidth;
      const maxHeight = Math.max(300, Math.min(520, window.innerHeight * 0.5));
      const tallest = Math.max(outer.desktop.h, outer.phone.h);
      const shared = Math.min(1, (width - GAP) / (outer.desktop.w + outer.phone.w), maxHeight / tallest);

      let layout;
      let desktopScale;
      let phoneScale;
      if (shared >= MIN_SHARED_SCALE) {
        layout = 'side';
        desktopScale = phoneScale = shared;
      } else if (width >= MIN_SIDE_BY_SIDE) {
        // Keep the phone readable and give the desktop frame what is left.
        layout = 'side';
        phoneScale = Math.min(maxHeight / outer.phone.h, (0.45 * width) / outer.phone.w);
        desktopScale = Math.min(phoneScale, (width - outer.phone.w * phoneScale - GAP) / outer.desktop.w);
      } else {
        // Leave room for the pinned brief above, so both stay in view while the player checks.
        layout = 'stack';
        phoneScale = Math.min(1, width / outer.phone.w, (window.innerHeight * 0.72) / outer.phone.h);
        desktopScale = Math.min(1, width / outer.desktop.w);
      }

      const key = `${layout}:${desktopScale.toFixed(4)}:${phoneScale.toFixed(4)}`;
      if (key === lastKey) return;
      lastKey = key;
      frames.dataset.layout = layout;
      setScale(desktop.figure, outer.desktop, desktopScale);
      setScale(phone.figure, outer.phone, phoneScale);
    }

    new ResizeObserver(fit).observe(root);
    window.addEventListener('resize', fit);
    fit();

    return {
      viewports: { desktop: desktop.viewport, phone: phone.viewport },
      assistant: { root: assistant, message },
    };
  }

  function setScale(figure, size, scale) {
    figure.style.setProperty('--s', scale.toFixed(4));
    figure.style.setProperty('--fw', String(size.w));
    figure.style.setProperty('--fh', String(size.h));
  }

  function buildDesktopFrame(el) {
    const figure = el('figure', 'frame frame--desktop');
    const box = el('div', 'frame-box');
    const scaler = el('div', 'frame-scaler');
    const bar = el('div', 'browser-bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.append(el('span', 'browser-address', 'brightwell-landscaping.example/contact'));
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
    scaler.append(viewport);
    box.append(scaler);
    figure.append(box, el('figcaption', 'frame-caption', 'Phone'));
    return { figure, viewport };
  }

  function showEmpty(viewports, el) {
    for (const viewport of viewports) {
      viewport.replaceChildren(el('p', 'viewport-empty', 'Nothing built yet'));
    }
  }

  PG.Renderer = { mount, DEVICES };
})(globalThis.PG = globalThis.PG || {});
