/* The client brief. In pass 4 its requirement rows become the toggles the player
   marks after a build, and this file grows the reveal and retry loop. */
(function (PG) {
  'use strict';

  function mountBrief(root, level) {
    const { el } = PG.dom;
    const client = el('p', 'ticket-client', level.brief.client);
    const job = el('p', 'ticket-job', level.brief.job);
    const list = el('ul', 'reqs');
    for (const req of level.requirements) {
      const item = el('li', 'req');
      item.dataset.req = req.id;
      item.append(el('span', 'req-text', req.text));
      list.append(item);
    }
    root.replaceChildren(client, job, list);
    return { root, list };
  }

  PG.Review = { mountBrief };
})(globalThis.PG = globalThis.PG || {});
