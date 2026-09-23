/* Tiny DOM helpers shared by every view. Loaded first; everything hangs off one global, PG. */
(function (PG) {
  'use strict';

  // el('button', 'chip', 'make it nice') -> <button class="chip">make it nice</button>
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  PG.dom = { el };
})(globalThis.PG = globalThis.PG || {});
