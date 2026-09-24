/* Prompt builder.
   Top half: the placement model. Pure data in, new data out, so node tests can drive it.
   Bottom half: the DOM layer. A chip moves three ways, all ending in the same two calls
   (commitPlace / commitRemove): drag it, tap it then tap a socket, or do the same with
   the keyboard, since every chip and target socket is a real <button>. */
(function (PG) {
  'use strict';

  function fragmentById(level, id) {
    const frag = level.fragments.find((f) => f.id === id);
    if (!frag) throw new Error(`Unknown fragment "${id}"`);
    return frag;
  }

  function slotById(level, id) {
    const slot = level.slots.find((s) => s.id === id);
    if (!slot) throw new Error(`Unknown slot "${id}"`);
    return slot;
  }

  // ---------------------------------------------------------------------------
  // Placement model
  // state = { sockets: { action: [fragId|null], ..., specifics: [fragId|null, fragId|null] } }
  // ---------------------------------------------------------------------------

  const Placement = {
    create(level) {
      const sockets = {};
      for (const slot of level.slots) sockets[slot.id] = new Array(slot.capacity).fill(null);
      return { sockets };
    },

    locate(state, fragId) {
      for (const slotId of Object.keys(state.sockets)) {
        const index = state.sockets[slotId].indexOf(fragId);
        if (index !== -1) return { slot: slotId, index };
      }
      return null;
    },

    // Put a chip into a socket. Whatever was in that socket goes back to the tray, unless
    // the moving chip came from another socket of the same slot: then the two trade places.
    place(state, level, fragId, slotId, index) {
      const frag = fragmentById(level, fragId);
      if (frag.slot !== slotId) throw new Error(`"${frag.text}" only fits the ${frag.slot} slot`);
      const row = state.sockets[slotId];
      if (!(Number.isInteger(index) && index >= 0 && index < row.length)) {
        throw new RangeError(`The ${slotId} slot has no socket ${index}`);
      }
      const from = Placement.locate(state, fragId);
      if (from && from.index === index) return state;

      const sockets = copySockets(state);
      if (from) sockets[slotId][from.index] = row[index];
      sockets[slotId][index] = fragId;
      return { sockets };
    },

    remove(state, fragId) {
      const at = Placement.locate(state, fragId);
      if (!at) return state;
      const sockets = copySockets(state);
      sockets[at.slot][at.index] = null;
      return { sockets };
    },

    firstFree(state, slotId) {
      return state.sockets[slotId].indexOf(null);
    },

    missingRequired(state, level) {
      return level.slots.filter((s) => s.required && state.sockets[s.id].every((id) => id === null));
    },

    isReady(state, level) {
      return Placement.missingRequired(state, level).length === 0;
    },

    // Placed fragment ids in declaration order, so a prompt never depends on drag history.
    placed(state, level) {
      return level.fragments.map((f) => f.id).filter((id) => Placement.locate(state, id));
    },
  };

  function copySockets(state) {
    const sockets = {};
    for (const slotId of Object.keys(state.sockets)) sockets[slotId] = state.sockets[slotId].slice();
    return sockets;
  }

  // ---------------------------------------------------------------------------
  // DOM layer
  // ---------------------------------------------------------------------------

  const HOLD_MS = 180; // touch: hold this long before a chip can be dragged, so a swipe still scrolls the page
  const TOUCH_SLOP = 10; // touch: moving further than this before the hold ends means "scrolling"
  const DRAG_SLOP = 6; // move this far before a press becomes a drag; a still press of any length is a tap

  function mount(root, level, { onChange = () => {}, onRun = () => {} } = {}) {
    const { el } = PG.dom;

    let state = Placement.create(level);
    let selected = null; // fragment id picked up by tap or keyboard
    let locked = false;
    let lockedHint = ''; // why Run is off while the builder is locked, e.g. mid-build
    let lockedHintSaid = false; // said once per lock, however often Run or a chip is pressed
    let drag = null;
    let suppressClick = false;

    const chipEls = {};
    const homeEls = {};
    const socketEls = {};
    const emptyEls = {};

    // ----- build the DOM once; sync() keeps it matched to state afterwards -----

    const slotsEl = el('div', 'slots');
    for (const slot of level.slots) {
      const slotEl = el('div', `slot slot--${slot.id}`);
      slotEl.dataset.slot = slot.id;

      const rail = el('div', 'slot-rail');
      const socketsEl = el('div', 'sockets');
      socketEls[slot.id] = [];
      emptyEls[slot.id] = [];
      for (let i = 0; i < slot.capacity; i++) {
        const socket = el('div', 'socket');
        socket.dataset.slot = slot.id;
        socket.dataset.index = String(i);
        const empty = el('button', 'socket-empty');
        empty.type = 'button';
        empty.append(el('span', 'socket-hint', 'Place here'));
        socket.append(empty);
        socketEls[slot.id].push(socket);
        emptyEls[slot.id].push(empty);
        socketsEl.append(socket);
      }
      rail.append(socketsEl, el('span', 'slot-name', slot.name));

      const tray = el('div', 'tray');
      tray.setAttribute('role', 'group');
      tray.setAttribute('aria-label', `${slot.name} fragments`);
      for (const frag of level.fragments.filter((f) => f.slot === slot.id)) {
        const home = el('span', 'tray-home');
        const ghost = el('span', 'tile tile--ghost', frag.text);
        ghost.setAttribute('aria-hidden', 'true');
        const chip = el('button', 'tile chip', frag.text);
        chip.type = 'button';
        chip.dataset.frag = frag.id;
        home.append(ghost, chip);
        chipEls[frag.id] = chip;
        homeEls[frag.id] = home;
        tray.append(home);
      }

      slotEl.append(rail, tray);
      slotsEl.append(slotEl);
    }

    const runArea = el('div', 'run-area');
    const runHint = el('p', 'run-hint');
    runHint.id = 'run-hint';
    const runBtn = el('button', 'run', 'Run');
    runBtn.type = 'button';
    runBtn.setAttribute('aria-describedby', runHint.id);
    runArea.append(runHint, runBtn);
    slotsEl.append(runArea);

    const status = el('p', 'visually-hidden');
    status.setAttribute('role', 'status');

    root.replaceChildren(slotsEl, status);

    // ----- helpers -----

    const textOf = (id) => fragmentById(level, id).text;
    const slotName = (id) => slotById(level, id).name;

    function announce(message) {
      status.textContent = '';
      window.requestAnimationFrame(() => { status.textContent = message; });
    }

    function sync() {
      const sel = selected ? fragmentById(level, selected) : null;

      for (const slot of level.slots) {
        const isTarget = !!sel && sel.slot === slot.id && !locked;
        state.sockets[slot.id].forEach((fragId, i) => {
          const socket = socketEls[slot.id][i];
          const empty = emptyEls[slot.id][i];
          const content = fragId ? chipEls[fragId] : empty;
          if (socket.firstElementChild !== content || socket.childElementCount !== 1) socket.replaceChildren(content);
          socket.classList.toggle('is-filled', !!fragId);
          socket.classList.toggle('is-target', isTarget);
          empty.tabIndex = isTarget ? 0 : -1;
          empty.setAttribute('aria-disabled', String(!isTarget));
          empty.setAttribute('aria-label', isTarget ? `Place “${sel.text}” in ${slot.name}` : `${slot.name}, empty`);
        });
      }

      for (const frag of level.fragments) {
        const chip = chipEls[frag.id];
        const home = homeEls[frag.id];
        const at = Placement.locate(state, frag.id);
        if (!at && chip.parentNode !== home) home.append(chip);
        home.classList.toggle('is-empty', !!at);
        if (at) {
          // While a chip for another slot is picked up, placed chips are not targets.
          const inert = !!sel && sel.slot !== frag.slot;
          const where = `${frag.text}, in ${slotName(frag.slot)}`;
          chip.removeAttribute('aria-pressed');
          chip.setAttribute('aria-disabled', String(locked || inert));
          chip.setAttribute('aria-label', !sel ? `${where}. Press to take it out`
            : inert ? where
            : `${where}. Press to swap in “${sel.text}”`);
        } else {
          chip.setAttribute('aria-disabled', String(locked));
          chip.setAttribute('aria-pressed', String(selected === frag.id));
          chip.removeAttribute('aria-label');
        }
      }

      const missing = Placement.missingRequired(state, level);
      runBtn.setAttribute('aria-disabled', String(missing.length > 0 || locked));
      runHint.textContent = locked ? lockedHint
        : missing.length ? `Add ${joinWords(missing.map((s) => withArticle(s.name)))} to run`
        : '';
      root.classList.toggle('has-selection', !!sel);
      root.classList.toggle('is-locked', locked);
    }

    function select(id) {
      selected = id;
      sync();
    }

    function commitPlace(id, slotId, index, fromKeyboard) {
      const displaced = state.sockets[slotId][index];
      state = Placement.place(state, level, id, slotId, index);
      selected = null;
      sync();
      let message = `“${textOf(id)}” placed in ${slotName(slotId)}.`;
      if (displaced && displaced !== id && !Placement.locate(state, displaced)) {
        message += ` “${textOf(displaced)}” went back to the tray.`;
      }
      announce(message);
      if (fromKeyboard) chipEls[id].focus();
      onChange(api);
    }

    function commitRemove(id, fromKeyboard) {
      state = Placement.remove(state, id);
      sync();
      announce(`“${textOf(id)}” went back to the tray.`);
      if (fromKeyboard) chipEls[id].focus();
      onChange(api);
    }

    function focusTargetFor(slotId) {
      const free = Placement.firstFree(state, slotId);
      const target = free !== -1 ? emptyEls[slotId][free] : chipEls[state.sockets[slotId][0]];
      target.focus();
    }

    // ----- taps, clicks and keyboard (Enter/Space arrive here as clicks with detail 0) -----

    function onClickCapture(event) {
      if (!suppressClick) return;
      event.stopImmediatePropagation();
      event.preventDefault();
    }

    function onClick(event) {
      const button = event.target.closest('button');
      const fromKeyboard = event.detail === 0;
      if (button && button === runBtn) return run();
      if (locked) {
        if (event.target.closest('.chip, .socket')) sayLockedHint();
        return;
      }

      // Anywhere inside a socket that takes the picked-up chip places it there: the empty
      // socket, the chip already in it (a swap), or the padding around either.
      const socket = event.target.closest('.socket');
      if (socket && root.contains(socket) && selected && fragmentById(level, selected).slot === socket.dataset.slot) {
        return commitPlace(selected, socket.dataset.slot, Number(socket.dataset.index), fromKeyboard);
      }

      if (!button || !root.contains(button) || !button.classList.contains('chip')) return;
      const id = button.dataset.frag;
      if (Placement.locate(state, id)) {
        // A placed chip comes out only when nothing is picked up; otherwise it is not a target.
        if (!selected) commitRemove(id, fromKeyboard);
        return;
      }
      if (selected === id) {
        select(null);
        announce(`Put down “${textOf(id)}”.`);
        return;
      }
      select(id);
      const slotId = fragmentById(level, id).slot;
      announce(`Picked up “${textOf(id)}”. Choose where it goes in ${slotName(slotId)}.`);
      if (fromKeyboard) focusTargetFor(slotId);
    }

    function onDocumentClick(event) {
      if (selected && !event.target.closest('.chip, .socket')) {
        select(null);
      }
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (drag) {
        const { pointerId, active } = drag;
        endDrag();
        if (active) swallowNextClick(pointerId);
        return;
      }
      if (!selected) return;
      const id = selected;
      const hadFocus = root.contains(document.activeElement);
      select(null);
      announce(`Put down “${textOf(id)}”.`);
      if (hadFocus) chipEls[id].focus();
    }

    // A drag cancelled with Escape still ends in a button release; that release's click is not a tap.
    function swallowNextClick(pointerId) {
      const onUp = (event) => {
        if (event.pointerId !== pointerId) return;
        disarm();
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      };
      const disarm = () => {
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointerdown', disarm, true);
      };
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointerdown', disarm, true); // never outlive the gesture it belongs to
    }

    function sayLockedHint() {
      if (!lockedHint || lockedHintSaid) return;
      lockedHintSaid = true;
      announce(lockedHint);
    }

    function run() {
      if (locked) return sayLockedHint();
      if (!Placement.isReady(state, level)) {
        announce(runHint.textContent);
        return;
      }
      onRun(api);
    }

    // ----- drag (Pointer Events, so mouse, pen and touch share one path) -----

    function onPointerDown(event) {
      if (locked || drag) return;
      const chip = event.target.closest('.chip');
      if (!chip || !root.contains(chip)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const rect = chip.getBoundingClientRect();
      drag = {
        id: chip.dataset.frag,
        chip,
        pointerId: event.pointerId,
        touch: event.pointerType === 'touch',
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        armed: !(event.pointerType === 'touch'), // touch arms after the hold; mouse and pen at once
        active: false,
        ghost: null,
        over: null,
        holdTimer: 0,
      };
      if (drag.touch) drag.holdTimer = window.setTimeout(() => { if (drag) drag.armed = true; }, HOLD_MS);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', endDrag);
      window.addEventListener('blur', endDrag);
    }

    function onPointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.active) {
        const moved = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
        if (!drag.armed) {
          if (moved > TOUCH_SLOP) endDrag(); // a swipe, not a hold: leave it to the page
          return;
        }
        if (moved < DRAG_SLOP) return; // finger jitter; releasing now is still a tap
        activateDrag();
      }
      moveGhost();
    }

    function onPointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.active) return endDrag(); // a plain tap: the click handler takes it from here

      const { id, over } = drag;
      suppressClick = true; // the click that follows this pointerup belongs to the drag
      window.setTimeout(() => { suppressClick = false; }, 0);
      endDrag();
      if (over) {
        commitPlace(id, over.dataset.slot, Number(over.dataset.index), false);
      } else if (Placement.locate(state, id)) {
        commitRemove(id, false); // a placed chip dropped anywhere but a socket goes home
      }
    }

    function activateDrag() {
      if (!drag || drag.active) return;
      drag.active = true;
      window.clearTimeout(drag.holdTimer);
      if (selected) select(null);

      const rect = drag.chip.getBoundingClientRect();
      const ghost = drag.chip.cloneNode(true);
      ghost.className = 'tile chip chip--ghost';
      ghost.removeAttribute('aria-pressed');
      ghost.removeAttribute('aria-label');
      ghost.removeAttribute('aria-disabled');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      ghost.style.width = `${rect.width}px`;
      document.body.append(ghost);
      drag.ghost = ghost;

      drag.chip.classList.add('is-lifted');
      document.documentElement.classList.add('is-dragging-chip');
      const slotId = fragmentById(level, drag.id).slot;
      for (const socket of socketEls[slotId]) socket.classList.add('is-droppable');
      moveGhost();
    }

    function moveGhost() {
      const { ghost, x, y, offsetX, offsetY } = drag;
      ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(-2deg)`;

      const hit = document.elementFromPoint(x, y);
      const socket = hit && hit.closest('.socket');
      const valid = socket && root.contains(socket) && socket.dataset.slot === fragmentById(level, drag.id).slot
        ? socket
        : null;
      if (valid !== drag.over) {
        if (drag.over) drag.over.classList.remove('is-drop-hover');
        if (valid) valid.classList.add('is-drop-hover');
        drag.over = valid;
      }
    }

    function endDrag() {
      if (!drag) return;
      window.clearTimeout(drag.holdTimer);
      if (drag.ghost) drag.ghost.remove();
      drag.chip.classList.remove('is-lifted');
      for (const socket of root.querySelectorAll('.socket')) socket.classList.remove('is-droppable', 'is-drop-hover');
      document.documentElement.classList.remove('is-dragging-chip');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
      drag = null;
    }

    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('click', onClick);
    // A held Enter repeats; one press is one Run, not a build and then another over its report.
    runBtn.addEventListener('keydown', (event) => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.chip')) event.preventDefault(); // long-press menus fight the touch drag
    });
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    // Once a touch hold has armed a drag, stop the page from scrolling under the finger.
    document.addEventListener('touchmove', (event) => {
      if (drag && drag.touch && drag.armed) event.preventDefault();
    }, { passive: false });

    const api = {
      get state() { return state; },
      placed: () => Placement.placed(state, level),
      isReady: () => Placement.isReady(state, level),
      // While locked nothing moves and Run is off; `hint` says why, beside Run.
      setLocked(value, hint = '') {
        locked = !!value;
        lockedHint = locked ? hint : '';
        lockedHintSaid = false;
        if (!locked) status.textContent = '';
        if (locked) {
          endDrag();
          selected = null;
        }
        sync();
      },
    };

    sync();
    return api;
  }

  function withArticle(word) {
    return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
  }

  function joinWords(words) {
    if (words.length <= 1) return words.join('');
    return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  }

  PG.Placement = Placement;
  PG.Builder = { mount };
})(globalThis.PG = globalThis.PG || {});
