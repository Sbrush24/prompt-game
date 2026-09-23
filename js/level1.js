/* Level 1 content. Everything the level says, offers, or decides lives here as data.
   No other file special-cases a fragment: the interpreter, renderer and grader only read
   this table and the build spec it produces. */
(function (PG) {
  'use strict';

  // An effect writes one build-spec property. Its strength is how plainly the player said it:
  // implied (inferred from the noun) < vague (an instruction the AI reads its own way) < explicit.
  // Anything no effect touches keeps the AI's default.
  const implied = (prop, value) => ({ prop, value, strength: 'implied' });
  const vague = (prop, value) => ({ prop, value, strength: 'vague' });
  const explicit = (prop, value) => ({ prop, value, strength: 'explicit' });

  PG.levels = PG.levels || {};
  PG.levels.level1 = {
    id: 'level1',
    number: 1,
    title: 'Vagueness has a cost',

    brief: {
      client: 'Brightwell Landscaping',
      job: 'A contact form for our website',
    },

    // Everything the simulated AI decides, with the value it picks when nobody tells it.
    vocabulary: {
      heading: { type: 'text', default: 'Get in touch' },
      'field.name': { type: 'bool', default: false },
      'field.email': { type: 'bool', default: false },
      'field.phone': { type: 'bool', default: false },
      'field.message': { type: 'bool', default: false },
      'field.details': { type: 'bool', default: false },
      'field.password': { type: 'bool', default: false },
      submitLabel: { type: 'text', default: 'Submit' },
      layout: { type: 'enum', values: ['grid-fixed', 'hero-split', 'stacked', 'fluid'], default: 'grid-fixed' },
      theme: { type: 'enum', values: ['plain', 'fancy', 'bare'], default: 'plain' },
      validation: { type: 'bool', default: false },
    },

    // The prompt reads left to right: action, thing, constraints, specifics.
    slots: [
      { id: 'action', name: 'action', capacity: 1, required: true },
      { id: 'thing', name: 'thing', capacity: 1, required: true },
      { id: 'constraints', name: 'constraints', capacity: 1, required: false },
      { id: 'specifics', name: 'specifics', capacity: 2, required: false },
    ],

    fragments: [
      { id: 'build', slot: 'action', text: 'build me', effects: [] },
      { id: 'make', slot: 'action', text: 'make', effects: [] },
      { id: 'working', slot: 'action', text: 'create a working', effects: [explicit('validation', true)] },

      { id: 'form', slot: 'thing', text: 'a form', effects: [
        implied('field.name', true), implied('field.email', true), implied('field.password', true),
      ] },
      { id: 'contact', slot: 'thing', text: 'a contact form', effects: [
        implied('heading', 'Contact us'),
        implied('field.name', true), implied('field.email', true), implied('field.message', true),
      ] },
      { id: 'quote', slot: 'thing', text: 'a quote request form', effects: [
        implied('heading', 'Request a quote'),
        implied('field.name', true), implied('field.email', true), implied('field.phone', true), implied('field.details', true),
        implied('submitLabel', 'Request a quote'),
      ] },

      { id: 'nice', slot: 'constraints', text: 'make it nice', effects: [
        vague('theme', 'fancy'), vague('layout', 'hero-split'),
        vague('field.phone', false), vague('field.details', false), vague('submitLabel', 'Submit'),
      ] },
      { id: 'simple', slot: 'constraints', text: 'keep it simple', effects: [
        vague('theme', 'bare'), vague('layout', 'stacked'),
        vague('field.phone', false), vague('field.message', false), vague('field.details', false),
      ] },
      { id: 'fields', slot: 'constraints', text: 'with name, email, and phone fields', effects: [
        explicit('field.name', true), explicit('field.email', true), explicit('field.phone', true),
      ] },

      { id: 'button', slot: 'specifics', text: 'make the button say Get a quote', effects: [
        explicit('submitLabel', 'Get a quote'),
      ] },
      { id: 'mobile', slot: 'specifics', text: 'mobile friendly', effects: [explicit('layout', 'fluid')] },
    ],

    // The client's brief. Each check reads only the build spec, never the fragments,
    // so any prompt that produces the right form passes.
    requirements: [
      { id: 'phone', text: 'Asks for a phone number', reads: ['field.phone'],
        met: (spec) => spec['field.phone'] === true },
      { id: 'noAccount', text: 'No account required', reads: ['field.password'],
        met: (spec) => spec['field.password'] === false },
      { id: 'mobile', text: 'Works on a phone', reads: ['layout'],
        met: (spec) => spec.layout === 'stacked' || spec.layout === 'fluid' },
      { id: 'button', text: 'Button says exactly “Get a quote”', reads: ['submitLabel'],
        met: (spec) => spec.submitLabel === 'Get a quote' },
    ],
  };
})(globalThis.PG = globalThis.PG || {});
