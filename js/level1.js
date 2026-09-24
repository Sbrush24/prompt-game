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

  // The fields the mock form can show, in page order.
  const FORM_FIELDS = [
    { prop: 'field.name', label: 'Name' },
    { prop: 'field.email', label: 'Email' },
    { prop: 'field.phone', label: 'Phone' },
    { prop: 'field.password', label: 'Password', secret: true },
    { prop: 'field.message', label: 'Message', multiline: true },
    { prop: 'field.details', label: 'Project details', multiline: true },
  ];

  const listWords = (words) => (words.length < 3
    ? words.join(' and ')
    : `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`);

  PG.levels = PG.levels || {};
  PG.levels.level1 = {
    id: 'level1',
    number: 1,
    title: 'Vagueness has a cost',

    brief: {
      client: 'Brightwell Landscaping',
      job: 'A contact form for our website',
    },

    // The client's website, which the built form is drawn into.
    site: {
      name: 'Brightwell Landscaping',
      address: 'brightwell-landscaping.example/contact',
      nav: ['Services', 'Gallery', 'Contact'],
      tagline: 'Gardens built to last',
    },

    formFields: FORM_FIELDS,

    // Everything the simulated AI decides, with the value it picks when nobody tells it.
    // Each form field is a yes/no, made from FORM_FIELDS, so the fields the grader can check
    // and the fields the renderer can draw are one list.
    vocabulary: {
      heading: { type: 'text', default: 'Get in touch' },
      ...Object.fromEntries(FORM_FIELDS.map((f) => [f.prop, { type: 'bool', default: false }])),
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
      // Read back as "create a working contact form", not "create a working a contact form".
      { id: 'working', slot: 'action', text: 'create a working', dropsNextArticle: true, effects: [explicit('validation', true)] },

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

      // `lead` is what joins a fragment to the words before it when the prompt is read back (default: a space).
      { id: 'nice', slot: 'constraints', text: 'make it nice', lead: ', ', effects: [
        vague('theme', 'fancy'), vague('layout', 'hero-split'),
        vague('field.phone', false), vague('field.details', false), vague('submitLabel', 'Submit'),
      ] },
      { id: 'simple', slot: 'constraints', text: 'keep it simple', lead: ', ', effects: [
        vague('theme', 'bare'), vague('layout', 'stacked'),
        vague('field.phone', false), vague('field.message', false), vague('field.details', false),
      ] },
      { id: 'fields', slot: 'constraints', text: 'with name, email, and phone fields', effects: [
        explicit('field.name', true), explicit('field.email', true), explicit('field.phone', true),
      ] },

      { id: 'button', slot: 'specifics', text: 'make the button say Get a quote', lead: ', ', effects: [
        explicit('submitLabel', 'Get a quote'),
      ] },
      { id: 'mobile', slot: 'specifics', text: 'mobile friendly', lead: ', ', effects: [explicit('layout', 'fluid')] },
    ],

    // The AI's report after a build. Always confident, and only ever about its own choices:
    // it never saw the brief, so it never mentions it. Each line is keyed by the final value of
    // the properties it reads, never by the prompt, so the text grows with the vocabulary, not
    // with the number of combinations. `reads` lets a later pass point at the line behind a miss.
    report: {
      opener: (spec) => `Your “${spec.heading}” form is ready.`,
      lines: [
        {
          id: 'fields',
          reads: FORM_FIELDS.filter((f) => !f.secret).map((f) => f.prop),
          say(spec, why) {
            const shown = FORM_FIELDS.filter((f) => !f.secret && spec[f.prop]).map((f) => f.label.toLowerCase());
            const trimmed = FORM_FIELDS.some((f) => !f.secret && !spec[f.prop] && why[f.prop].strength === 'vague');
            return trimmed
              ? `Streamlined it to the essentials: ${listWords(shown)}. Shorter forms get more replies.`
              : `Kept the fields focused: ${listWords(shown)}.`;
          },
        },
        {
          id: 'password',
          reads: ['field.password'],
          say: (spec) => (spec['field.password'] ? 'Added a password so people can log back in and check on their request.' : null),
        },
        {
          id: 'button',
          reads: ['submitLabel'],
          say: (spec) => ({
            Submit: 'Kept the classic “Submit” button. Everyone knows what it does.',
            'Request a quote': 'Labelled the button “Request a quote” to match the form.',
          })[spec.submitLabel] || `Labelled the button “${spec.submitLabel}”.`,
        },
        {
          id: 'layout',
          reads: ['layout'],
          say: (spec) => ({
            'grid-fixed': 'Laid the fields out in a tidy two-column grid.',
            'hero-split': 'Put a big hero image beside the form. Very modern.',
            stacked: 'One simple column, nothing extra.',
            fluid: 'Made it responsive, so it resizes to fit any screen.',
          })[spec.layout],
        },
        {
          id: 'theme',
          reads: ['theme'],
          say: (spec) => ({
            fancy: 'Gave it soft gradients and rounded corners so it really pops.',
            bare: 'Stripped the styling right back.',
          })[spec.theme] || null,
        },
        {
          id: 'validation',
          reads: ['validation'],
          say: (spec) => (spec.validation ? 'Every field is checked before it sends.' : null),
        },
      ],
      closer: 'Built exactly what you asked for. Ready to ship!',
    },

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
