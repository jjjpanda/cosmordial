import { P, ROW } from './constants.js';
import { TAU, rand, jitter, orbit, separateEntities } from './space.js';
import { body, cell, eventCounts, glyph, starterGenome } from './entities.js';

export function createWorld(preset = 'orbit', cols = 80, rows = 30, G = P.G, boundary = 'box', matterBaseArea = cols * rows) {
  const w = cols;
  const h = rows * ROW;
  const c = { x: w / 2, y: h / 2, vx: 0, vy: 0 };
  const es = [];
  const clade = (g, x, y, vx, vy, energy = P.START_E) => {
    for (let k = 0; k < 3; k++) es.push(cell(x + jitter(3), y + jitter(3), vx + jitter(0.02), vy + jitter(0.02), [...g], energy));
  };
  if (preset === 'orbit') {
    const M = 35;
    es.push(body(c.x, c.y, 0, 0, M));
    for (let i = 0; i < 4; i++) es.push(body(...orbit(c, M, 14 + i * 5, (i * TAU) / 4, G), 2));
    for (let i = 0; i < 55; i++) es.push(body(...orbit(c, M, rand(8, h * 0.45), rand(0, TAU), G), P.MATTER));
    for (let i = 0; i < 10; i++) clade(starterGenome(), ...orbit(c, M, rand(10, 22), rand(0, TAU), G));
  } else if (preset === 'binary') {
    const M = 32;
    const radius = 15;
    const separation = 2 * radius;
    const v = P.BINARY_ORBIT_FACTOR * Math.sqrt((G * M * separation * radius) / (separation ** 2 + P.SOFT ** 2) ** 1.5);
    es.push({ ...body(c.x - radius, c.y, 0, -v, M), binaryStar: true }, { ...body(c.x + radius, c.y, 0, v, M), binaryStar: true });
    for (let i = 0; i < 65; i++) es.push(body(...orbit(c, 2 * M, rand(18, h * 0.48), rand(0, TAU), G), P.MATTER));
    for (let i = 0; i < 10; i++) {
      const s = es[i % 2];
      const a = rand(0, TAU);
      const r = rand(7, 13);
      clade(starterGenome(), s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, s.vx, s.vy);
    }
  } else {
    for (let i = 0; i < 10; i++) clade(starterGenome(), rand(8, w - 8), rand(8, h - 8), jitter(0.06), jitter(0.06));
  }

  const world = { preset, cols, rows, w, h, matterBaseArea, entities: es, trails: new Float32Array(cols * rows), flash: new Float32Array(cols * rows), events: eventCounts(), tick: 0 };
  separateEntities(es, world, boundary === 'torus');
  return world;
}

export function resizeWorld(world, cols, rows, boundary = 'box') {
  if (world.cols === cols && world.rows === rows) return world;
  const oldCols = world.cols;
  const oldRows = world.rows;
  const shiftX = (cols - oldCols) / 2;
  const shiftY = (rows - oldRows) / 2;
  const gridX = Math.floor(shiftX);
  const gridY = Math.floor(shiftY);
  const trails = new Float32Array(cols * rows);
  const flash = new Float32Array(cols * rows);
  const sourceX = Math.max(0, -gridX);
  const sourceY = Math.max(0, -gridY);
  const targetX = Math.max(0, gridX);
  const targetY = Math.max(0, gridY);
  const copyWidth = Math.max(0, Math.min(oldCols - sourceX, cols - targetX));
  const copyHeight = Math.max(0, Math.min(oldRows - sourceY, rows - targetY));
  for (let y = 0; y < copyHeight; y++) {
    const source = (sourceY + y) * oldCols + sourceX;
    const target = (targetY + y) * cols + targetX;
    trails.set(world.trails.subarray(source, source + copyWidth), target);
    flash.set(world.flash.subarray(source, source + copyWidth), target);
  }
  const width = cols;
  const height = rows * ROW;
  world.entities = world.entities.filter((entity) => {
    entity.x += shiftX;
    entity.y += shiftY * ROW;
    if (boundary === 'torus') {
      entity.x = ((entity.x % width) + width) % width;
      entity.y = ((entity.y % height) + height) % height;
      return true;
    }
    return entity.x >= 0 && entity.x < width && entity.y >= 0 && entity.y < height;
  });
  world.cols = cols;
  world.rows = rows;
  world.w = width;
  world.h = height;
  world.trails = trails;
  world.flash = flash;
  return world;
}

export function census(w) {
  const counts = {};
  let pop = 0;
  let gen = 0;
  let energy = 0;
  let age = 0;
  for (const e of w.entities) {
    const c = glyph(e);
    counts[c] = (counts[c] || 0) + 1;
    if (e.g) {
      pop++;
      gen = Math.max(gen, e.gen);
      energy += e.energy;
      age += e.age;
    }
  }
  return { tick: w.tick, pop, gen, counts, avgEnergy: pop ? energy / pop : 0, avgAge: pop ? age / pop : 0, events: { ...w.events } };
}
