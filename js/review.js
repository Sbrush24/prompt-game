/* The client brief, and the check after a build.
   Before the first Run its items are plain rows. From Run on they are checkboxes: they wait
   while the build runs, then the player ticks what they think the build does and presses
   Check. The reveal puts the truth beside each call, with a note on what the page shows,
   and offers Retry. It says what happened, never why and never where a fix would go. */
(function (PG) {
  'use strict';

  // The player's call against the truth. "Missed" (ticked, but not met) is where the lesson lands.
  function callFor(ticked, met) {
    if (met) return ticked ? 'confirmed' : 'doubted';
    return ticked ? 'missed' : 'caught';
  }

  const CALLS = { confirmed: 'Confirmed', doubted: 'Doubted', caught: 'Caught', missed: 'Missed' };

  function mountBrief(root, level, { onCheck = () => {}, onRetry = () => {} } = {}) {
    const { el } = PG.dom;

    const client = el('p', 'ticket-client', level.brief.client);
    const job = el('p', 'ticket-job', level.brief.job);
    const list = el('ul', 'reqs');
    const footer = el('div', 'brief-footer');
    const say = el('p', 'brief-say');
    say.id = 'brief-say';
    const action = el('button', 'brief-action');
    action.type = 'button';
    const announcer = el('p', 'visually-hidden');
    announcer.setAttribute('role', 'status');
    footer.append(say, action);

    const rows = level.requirements.map((req) => {
      const item = el('li', 'req');
      item.dataset.req = req.id;
      const label = el('label', 'req-label');
      const box = el('input', 'req-box');
      box.type = 'checkbox';
      box.setAttribute('aria-describedby', say.id);
      label.append(box, el('span', 'req-text', req.text));
      const outcome = el('p', 'req-outcome');
      const seen = el('p', 'req-seen');
      item.append(label, outcome, seen);
      list.append(item);
      return { req, item, box, outcome, seen };
    });

    root.replaceChildren(client, job, list, footer, announcer);

    let result = null;

    function setState(state) {
      root.dataset.state = state;
    }

    // Run pressed: fresh, empty boxes that wait for the build to finish.
    function startBuild() {
      result = null;
      say.classList.remove('is-approved');
      for (const row of rows) {
        row.box.checked = false;
        row.box.disabled = true;
        row.item.classList.remove('is-met', 'is-unmet');
        delete row.item.dataset.call;
        row.outcome.replaceChildren();
        row.seen.textContent = '';
      }
      say.textContent = 'Wait for the build to finish';
      action.textContent = 'Check';
      action.setAttribute('aria-disabled', 'true');
      setState('waiting');
    }

    // The build is done: the player can mark it.
    function startReview(built) {
      result = built;
      for (const row of rows) row.box.disabled = false;
      say.textContent = 'Tick what the build does';
      action.setAttribute('aria-disabled', 'false');
      setState('marking');
    }

    function reveal() {
      let metCount = 0;
      for (const row of rows) {
        const met = result.requirements.find((r) => r.id === row.req.id).met;
        const call = callFor(row.box.checked, met);
        if (met) metCount++;
        row.box.disabled = true;
        row.item.classList.add(met ? 'is-met' : 'is-unmet');
        row.item.dataset.call = call;
        const truth = el('span', 'req-truth');
        truth.append(el('span', 'req-glyph', met ? '✓' : '✗'), ` ${met ? 'Met' : 'Not met'}`);
        row.outcome.replaceChildren(truth, ' ', el('span', 'req-call', CALLS[call]));
        row.seen.textContent = row.req.seen(result.spec);
      }
      const passed = metCount === rows.length;
      say.classList.toggle('is-approved', passed); // stamped on the ticket
      say.textContent = passed ? 'Approved' : 'Not approved';
      action.textContent = passed ? 'Try another prompt' : 'Retry';
      setState('revealed');
      announcer.textContent = `${say.textContent}: ${metCount} of ${rows.length} met.`;
      onCheck({ passed, calls: Object.fromEntries(rows.map((row) => [row.req.id, row.item.dataset.call])) });
    }

    action.addEventListener('click', () => {
      if (action.getAttribute('aria-disabled') === 'true') return;
      if (root.dataset.state === 'marking') reveal();
      else if (root.dataset.state === 'revealed') onRetry();
    });

    setState('plain');

    return {
      root,
      startBuild,
      startReview,
      // Retry, or a build that failed to start: back to the plain brief, marks and all cleared.
      reset() {
        say.classList.remove('is-approved');
        for (const row of rows) {
          row.box.checked = false;
          row.item.classList.remove('is-met', 'is-unmet');
          delete row.item.dataset.call;
          row.outcome.replaceChildren();
          row.seen.textContent = '';
        }
        setState('plain');
      },
      // Without scrolling the build out of view, unless the box itself is out of view (a very
      // short screen, where the brief scrolls with the page).
      focusFirstBox() {
        const { box } = rows[0];
        box.focus({ preventScroll: true });
        const { top, bottom } = box.getBoundingClientRect();
        if (top < 0 || bottom > window.innerHeight) box.scrollIntoView({ block: 'nearest' });
      },
    };
  }

  PG.Review = { mountBrief, callFor };
})(globalThis.PG = globalThis.PG || {});
