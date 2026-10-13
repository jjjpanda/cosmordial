import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorld, tick } from '../src/sim.js';
import { P, ROLE, GLYPHS } from '../src/sim/constants.js';
import { eventCounts, glyph, roleOf } from '../src/sim/entities.js';
import { advanceLife } from '../src/sim/life.js';
import { delta, physicalRadius, separateEntities } from '../src/sim/space.js';

function withSeed(seed, run) {
  let state = seed;
  const random = Math.random;
  Math.random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return run();
  } finally {
    Math.random = random;
  }
}

function assertSeparated(world, wrap) {
  const entities = world.entities;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const [dx, dy] = delta(entities[i], entities[j], world, wrap);
      const distance = Math.hypot(dx, dy);
      const limit = physicalRadius(entities[i]) + physicalRadius(entities[j]);
      assert.ok(distance >= limit - 1e-6, `entities ${i} and ${j} overlap at tick ${world.tick}`);
    }
  }
}

test('roles keep their threshold and tie order', () => {
  const cases = [
    [[0, 0, 0.5, 0.5, 0.5], ROLE.CELL],
    [[0, 0, 0.8, 0.8, 0.8], ROLE.HUNTER],
    [[0, 0, 0, 0.8, 0], ROLE.HELIOTROPE],
    [[0, 0, 0, 0, 0.8], ROLE.PARASITE],
    [[0, 0.8, 0, 0, 0], ROLE.FORAGER],
  ];
  for (const [traits, expected] of cases) {
    const entity = { g: [...traits, 0.2, 0.2] };
    assert.equal(roleOf(entity), expected);
    assert.equal(glyph(entity), GLYPHS[expected]);
  }
  for (const [mass, expected] of [[P.MATTER, ROLE.FOOD], [P.ROCK, ROLE.ROCK], [P.STAR, ROLE.STAR]]) {
    assert.equal(roleOf({ mass }), expected);
  }
});

test('worlds start and remain physically separated', () => {
  for (const [seed, preset, boundary] of [[11, 'orbit', 'box'], [12, 'binary', 'box'], [13, 'soup', 'torus']]) {
    withSeed(seed, () => {
      const world = createWorld(preset, 80, 30, P.G, boundary);
      const wrap = boundary === 'torus';
      assertSeparated(world, wrap);
      for (let i = 0; i < 100; i++) {
        tick(world, { boundary });
        assertSeparated(world, wrap);
      }
    });
  }
});

test('exactly coincident cells and wrapped neighbors separate', () => {
  const world = { w: 80, h: 60, tick: 0 };
  world.entities = [
    { x: 10, y: 10, g: [0] },
    { x: 10, y: 10, g: [0] },
    { x: 79.9, y: 20, g: [0] },
    { x: 0.1, y: 20, g: [0] },
  ];
  separateEntities(world.entities, world, true);
  assertSeparated(world, true);
});

test('stars keep a compact hitbox as they gain mass', () => {
  assert.equal(physicalRadius({ mass: P.STAR }), 1);
  assert.equal(physicalRadius({ mass: 35 }), 1);
});

test('parasites infect nearby foragers and hunters even when a closer host is immune', () => {
  const contact = (traits) => {
    const parasite = { x: 0, y: 0, vx: 0, vy: 0, g: [0, 0, 0, 0, 0.8, 0, 0], energy: 8, age: 5, gen: 1 };
    const immune = { x: 0.6, y: 0, vx: 0, vy: 0, g: [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0], energy: 10, age: 5, immuneUntil: 100 };
    const target = { x: 1.2, y: 0, vx: 0, vy: 0, g: traits, energy: 10, age: 5 };
    const cells = [parasite, immune, target];
    const d = (a, b) => [b.x - a.x, b.y - a.y];
    const nearest = (e, list, range, skip) => {
      let result = null;
      let best = range;
      for (const candidate of list) {
        if (candidate === e || skip?.(candidate)) continue;
        const [dx, dy] = d(e, candidate);
        const distance = Math.hypot(dx, dy);
        if (distance < best) { best = distance; result = [candidate, dx, dy, distance]; }
      }
      return result;
    };
    const events = eventCounts();
    const random = Math.random;
    Math.random = () => 0.6;
    try {
      advanceLife({ w: { w: 10, h: 10 }, wrap: false, mutation: 0, d, nearest, es: cells, cells, stars: [], food: [], born: [], events });
    } finally {
      Math.random = random;
    }
    return { infected: !!target.spore, events: events.infections };
  };
  assert.deepEqual(contact([0, 0.8, 0, 0, 0, 0, 0]), { infected: true, events: 1 });
  assert.deepEqual(contact([0, 0, 0.8, 0, 0, 0, 0]), { infected: true, events: 1 });
  assert.deepEqual(contact([0.2, 0.2, 0.2, 0.2, 0.2, 0, 0]), { infected: false, events: 0 });
});

test('trail length controls decay with fixed trail brightness', () => {
  const empty = () => ({ cols: 3, rows: 3, w: 3, h: 6, preset: 'soup', tick: 0, entities: [], trails: Float32Array.from({ length: 9 }, () => 1), flash: new Float32Array(9), events: eventCounts() });
  const off = empty();
  tick(off, { trailLength: 0 });
  assert.ok(off.trails.every((value) => value === 0));
  const short = empty();
  const long = empty();
  tick(short, { trailLength: 6 });
  tick(long, { trailLength: 12 });
  assert.ok(long.trails[0] > short.trails[0]);

  const withCell = empty();
  withCell.trails.fill(0);
  withCell.entities.push({ x: 1.5, y: 3, vx: 0, vy: 0, g: [0, 0, 0, 0, 0, 0, 0], energy: 8, age: 0, gen: 0 });
  withSeed(21, () => tick(withCell));
  assert.equal(Math.max(...withCell.trails), 0.5);
});
