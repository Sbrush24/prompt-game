/* Kids Level 1 content. The same engine as the grown-up level: chips write a build spec, the
   simulated AI (Bolt) fills the gaps with his own ideas, and the wish list is checked against
   what was built. Only the words, the defaults and the picture are new. */
(function (PG) {
  'use strict';

  const implied = (prop, value) => ({ prop, value, strength: 'implied' });
  const vague = (prop, value) => ({ prop, value, strength: 'vague' });
  const explicit = (prop, value) => ({ prop, value, strength: 'explicit' });

  // How each hero and thing is named on screen.
  const HEROES = { robot: 'robot', cat: 'cat', dog: 'dog' };
  const THINGS = { coin: 'coins', fish: 'fish', bone: 'bones' };
  const SPEEDS = { slow: 'slow', normal: 'normal', fast: 'fast', turbo: 'TURBO' };

  PG.levels = PG.levels || {};
  PG.levels.kids1 = {
    id: 'kids1',
    number: 1,
    title: 'Say what you mean',

    brief: {
      client: 'Maya, age 9',
      job: 'A game for her cat Mittens’ birthday',
    },

    heroes: HEROES,
    things: THINGS,
    speeds: SPEEDS,

    // Everything Bolt decides, with what he picks when nobody tells him.
    vocabulary: {
      hero: { type: 'enum', values: Object.keys(HEROES), default: 'robot' },
      thing: { type: 'enum', values: Object.keys(THINGS), default: 'coin' },
      speed: { type: 'enum', values: Object.keys(SPEEDS), default: 'fast' },
      score: { type: 'bool', default: false },
      world: { type: 'enum', values: ['meadow', 'lava'], default: 'meadow' },
    },

    // The words around the game, in a kid's voice.
    words: {
      run: 'Go!',
      placeHere: 'Snap here',
      building: 'Bolt is building…',
      checkFirst: 'Check Maya’s list first',
      waiting: 'Wait for Bolt to finish',
      marking: 'Tick the wishes you think came true',
      met: 'Yes',
      notMet: 'No',
      approved: 'Maya loves it!',
      notApproved: 'Not quite',
      again: 'Play again',
      retry: 'Fix my blocks',
    },

    // The prompt reads left to right: start, thing, style, extras.
    slots: [
      { id: 'start', name: 'start', capacity: 1, required: true },
      { id: 'thing', name: 'thing', capacity: 1, required: true },
      { id: 'style', name: 'style', capacity: 1, required: false },
      { id: 'extras', name: 'extra', capacity: 2, required: false },
    ],

    fragments: [
      { id: 'make', slot: 'start', text: 'make', effects: [] },
      { id: 'build', slot: 'start', text: 'build me', effects: [] },
      { id: 'help', slot: 'start', text: 'help me make', effects: [] },

      // "A game" is all Bolt needs to start guessing: games should be exciting, right?
      { id: 'game', slot: 'thing', text: 'a game', effects: [implied('speed', 'turbo')] },
      { id: 'catch', slot: 'thing', text: 'a catch game', effects: [
        implied('score', true), implied('speed', 'normal'),
      ] },
      { id: 'pet', slot: 'thing', text: 'a pet game', effects: [
        implied('hero', 'dog'), implied('thing', 'bone'),
      ] },

      { id: 'cool', slot: 'style', text: 'make it cool', lead: ', ', effects: [
        vague('world', 'lava'), vague('speed', 'turbo'), vague('score', false),
      ] },
      { id: 'easy', slot: 'style', text: 'make it easy', lead: ', ', effects: [
        vague('speed', 'slow'), vague('score', false),
      ] },
      { id: 'catfish', slot: 'style', text: 'with a cat catching fish', effects: [
        explicit('hero', 'cat'), explicit('thing', 'fish'),
      ] },

      { id: 'slow', slot: 'extras', text: 'nice and slow', lead: ', ', effects: [explicit('speed', 'slow')] },
      { id: 'points', slot: 'extras', text: 'show the score', lead: ', ', effects: [explicit('score', true)] },
    ],

    // What Bolt says after a build. He never saw Maya's list, so he never mentions it, and he
    // is always sure he got it right.
    report: {
      opener: (spec) => `Ta-da! Your ${HEROES[spec.hero]} game is ready!`,
      lines: [
        {
          id: 'hero',
          reads: ['hero', 'thing'],
          say: (spec) => `The ${HEROES[spec.hero]} catches ${THINGS[spec.thing]}. A classic!`,
        },
        {
          id: 'speed',
          reads: ['speed'],
          say: (spec) => ({
            turbo: 'I made it TURBO fast. Way more exciting!',
            fast: 'It’s nice and speedy.',
            normal: 'It goes at a normal speed.',
            slow: 'Everything falls slowly, so it’s easy to play.',
          })[spec.speed],
        },
        {
          id: 'score',
          reads: ['score'],
          say: (spec, why) => (spec.score ? 'Your points show at the top.'
            : why.score.cause !== 'default' ? 'I hid the score so the screen looks cleaner.'
            : 'No score. You just play for fun!'),
        },
        {
          id: 'world',
          reads: ['world'],
          say: (spec) => (spec.world === 'lava' ? 'I added a lava floor. So cool!' : null),
        },
      ],
      closer: 'I built exactly what you asked for. It’s perfect!',
    },

    // Maya's wish list. Each check reads only the build, never the blocks.
    requirements: [
      { id: 'cat', text: 'The hero is a cat', reads: ['hero'],
        met: (spec) => spec.hero === 'cat',
        seen: (spec) => `The hero is a ${HEROES[spec.hero]}` },
      { id: 'fish', text: 'It catches fish', reads: ['thing'],
        met: (spec) => spec.thing === 'fish',
        seen: (spec) => `It catches ${THINGS[spec.thing]}` },
      { id: 'slow', text: 'Slow enough for my little brother', reads: ['speed'],
        met: (spec) => spec.speed === 'slow',
        seen: (spec) => `The speed is ${SPEEDS[spec.speed]}` },
      { id: 'score', text: 'It shows the score', reads: ['score'],
        met: (spec) => spec.score === true,
        seen: (spec) => (spec.score ? 'The score is showing' : 'No score anywhere') },
    ],
  };
})(globalThis.PG = globalThis.PG || {});
