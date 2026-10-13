import assert from 'node:assert/strict';
import test from 'node:test';
import * as esbuild from 'esbuild';
import { P, ROLE, GLYPHS } from '../src/sim/constants.js';
import { eventCounts } from '../src/sim/entities.js';

const { outputFiles } = await esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  write: false,
  loader: { '.css': 'text' },
});
const source = Buffer.from(outputFiles[0].text).toString('base64');
const { Cosmordial } = await import(`data:text/javascript;base64,${source}`);

test('draw updates the field, status, and population history', () => {
  const attrs = {};
  const speciesPaths = Array.from({ length: 5 }, () => ({ setAttribute(name, value) { this[name] = value; } }));
  const component = Object.create(Cosmordial.prototype);
  component.world = {
    cols: 4,
    rows: 2,
    entities: [
      { x: 1, y: 2, mass: 35 },
      { x: 0, y: 0, mass: 0.5 },
      { x: 2, y: 0, vx: 0.1, vy: 0.4, g: [0, 0.8, 0, 0, 0, 0.2, 0], energy: 10, age: 4, gen: 1 },
      { x: 3, y: 0, vx: -0.4, vy: 0.1, g: [0, 0, 0.8, 0, 0, 0.2, 0], energy: 12, age: 3, gen: 2 },
    ],
    trails: new Float32Array(8),
    flash: new Float32Array(8),
    events: eventCounts(),
    tick: 7,
  };
  component.history = [];
  component.speciesHistory = [];
  component.opts = { speed: 25 };
  component.raf = 0;
  component.view = { innerHTML: '' };
  component.status = { textContent: '' };
  component.events = { textContent: '' };
  component.pophead = { textContent: '' };
  component.sparkline = { setAttribute(name, value) { attrs[name] = value; } };
  component.sparklineLine = { setAttribute(name, value) { attrs[name] = value; } };
  component.speciesChart = { setAttribute(name, value) { attrs[`species-${name}`] = value; } };
  component.speciesPaths = speciesPaths;
  component.shadowRoot = { querySelectorAll() { return []; } };

  const summary = component.draw();
  assert.equal(summary.counts[GLYPHS[ROLE.FORAGER]], 1);
  assert.equal(summary.counts[GLYPHS[ROLE.HUNTER]], 1);
  assert.ok(component.view.innerHTML.includes('↓'));
  assert.ok(component.view.innerHTML.includes('◄'));
  assert.deepEqual(component.history, [2]);
  assert.deepEqual(component.speciesHistory, [[0, 1, 0, 1, 0]]);
  assert.ok(speciesPaths[1].d);
  assert.ok(speciesPaths[3].d);
  assert.equal(speciesPaths[4].d, '');
  assert.match(component.status.textContent, /Living 2\s+Tick 7/);
  assert.match(component.events.textContent, /Cells\s+born 0\s+died 0/);
  assert.match(component.pophead.textContent, /POPULATION/);
  assert.ok(attrs.points);

  component.opts.speed = 5;
  component.world.tick = 8;
  component.world.entities[3].g = [0, 0, 0, 0, 0, 0, 0];
  component.draw();
  assert.deepEqual(component.speciesHistory, [[0, 1, 0, 1, 0], [1, 1, 0, 0, 0]]);
  assert.ok(speciesPaths[0].d);
  assert.ok(speciesPaths[3].d);
  assert.match(attrs['species-aria-label'], /cell 1.*hunter 0/);
});

test('moving foragers and hunters face their velocity', () => {
  const cases = [
    [ROLE.FORAGER, 0, -1, '↑'],
    [ROLE.FORAGER, 1, 0, '→'],
    [ROLE.FORAGER, 0, 1, '↓'],
    [ROLE.FORAGER, -1, 0, '←'],
    [ROLE.FORAGER, -0.01, 0, '→'],
    [ROLE.HUNTER, 0, -1, '▲'],
    [ROLE.HUNTER, 1, 0, '►'],
    [ROLE.HUNTER, 0, 1, '▼'],
    [ROLE.HUNTER, -1, 0, '◄'],
    [ROLE.HUNTER, 0.01, 0, '▲'],
  ];
  for (const [role, vx, vy, expected] of cases) {
    const g = role === ROLE.FORAGER ? [0, 0.8, 0, 0, 0, 0, 0] : [0, 0, 0.8, 0, 0, 0, 0];
    const component = Object.create(Cosmordial.prototype);
    component.world = { cols: 1, rows: 1, entities: [{ x: 0, y: 0, vx, vy, g }], trails: [0], flash: [0] };
    component.view = { innerHTML: '' };
    component.renderField();
    assert.ok(component.view.innerHTML.includes(`>${expected}</span>`), `${role} at (${vx}, ${vy})`);
  }
});

test('stars render as a single mark without covering neighbors', () => {
  const component = Object.create(Cosmordial.prototype);
  component.world = {
    cols: 5,
    rows: 5,
    entities: [{ x: 2, y: 4, mass: 35 }],
    trails: new Float32Array(25),
    flash: new Float32Array(25),
  };
  component.view = { innerHTML: '' };
  const field = () => component.view.innerHTML.replaceAll('</span>', '').replace(/<span class="[^"]*"[^>]*>/g, '').split('\n');

  component.renderField();
  let lines = field();
  assert.equal(lines[2][3], '·');
  assert.equal(lines[3].slice(2, 5), `·${GLYPHS[ROLE.STAR]}·`);
  assert.equal(lines[4][3], '·');

  component.world.entities.push({ x: 3, y: 4, mass: P.MATTER });
  component.renderField();
  lines = field();
  assert.equal(lines[3][4], GLYPHS[ROLE.FOOD]);
});

test('starlight fades smoothly with distance and star power', () => {
  const component = Object.create(Cosmordial.prototype);
  component.world = {
    cols: 80, rows: 10,
    entities: [
      { x: 10, y: 10, mass: 35 },
      { x: 14, y: 10, mass: P.MATTER },
      { x: 29, y: 10, mass: P.MATTER },
      { x: 60, y: 10, mass: P.MATTER },
    ],
    trails: new Float32Array(800), flash: new Float32Array(800),
  };
  component.view = { innerHTML: '' };
  const nearbyGlow = () => Number(component.view.innerHTML.match(/<span class="m lit" style="--glow:(\d+)%">/)[1]);
  component.renderField();
  const brightGlow = nearbyGlow();
  assert.ok(brightGlow > 0);
  assert.equal(component.view.innerHTML.split(`<span class="m">${GLYPHS[ROLE.FOOD]}</span>`).length - 1, 2);
  const gridGlows = [...component.view.innerHTML.matchAll(/class="e lit" style="--glow:(\d+)%"/g)].map((match) => Number(match[1]));
  assert.ok(new Set(gridGlows).size > 8);
  assert.ok(component.view.innerHTML.includes('<span class="e">'));
  component.world.entities[0].mass = P.STAR;
  component.renderField();
  assert.ok(nearbyGlow() < brightGlow);
  component.world.entities.shift();
  component.renderField();
  assert.ok(!component.view.innerHTML.includes('class="e lit"'));
});
