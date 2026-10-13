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

const fakeField = () => ({
  style: { setProperty(name, value) { this[name] = value; } },
  cells: [],
  get children() { return this.cells; },
  set innerHTML(html) {
    this.cells = Array.from({ length: html.split('<span>').length - 1 }, () => {
      const cell = { className: '', textContent: '' };
      cell.style = { setProperty(_name, value) { cell.glow = value; } };
      return cell;
    });
  },
});

test('field uses one stable slot per character and rebuilds when dimensions change', () => {
  const component = Object.create(Cosmordial.prototype);
  component.view = fakeField();
  component.paintField(2, 2, ['.', '→', '□', '.'], ['e', 'f', 'm', 'e'], new Uint8Array([0, 20, 0, 0]));
  const original = component.view.cells.slice();
  assert.equal(component.view.style['--cols'], 2);
  assert.equal(original.length, 4);
  assert.equal(original[1].textContent, '→');
  assert.equal(original[1].className, 'f lit');
  component.paintField(2, 2, ['.', '←', '□', '.'], ['e', 'f', 'm', 'e'], new Uint8Array([0, 30, 0, 0]));
  assert.equal(component.view.cells[1], original[1]);
  assert.equal(original[1].textContent, '←');
  assert.equal(original[1].glow, '30%');
  component.paintField(4, 1, ['.', '.', '.', '.'], ['e', 'e', 'e', 'e'], new Uint8Array(4));
  assert.notEqual(component.view.cells[1], original[1]);
  assert.equal(component.view.style['--cols'], 4);
});

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
  component.view = fakeField();
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
  assert.ok(component.view.cells.some((cell) => cell.textContent === '↓'));
  assert.ok(component.view.cells.some((cell) => cell.textContent === '◄'));
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
    component.view = fakeField();
    component.renderField();
    assert.equal(component.view.cells[0].textContent, expected, `${role} at (${vx}, ${vy})`);
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
  component.view = fakeField();
  const field = () => Array.from({ length: 5 }, (_, y) => component.view.cells.slice(y * 5, y * 5 + 5).map((cell) => cell.textContent).join(''));

  component.renderField();
  let lines = field();
  assert.equal(lines[1][2], '·');
  assert.equal(lines[2].slice(1, 4), `·${GLYPHS[ROLE.STAR]}·`);
  assert.equal(lines[3][2], '·');

  component.world.entities.push({ x: 3, y: 4, mass: P.MATTER });
  component.renderField();
  lines = field();
  assert.equal(lines[2][3], GLYPHS[ROLE.FOOD]);
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
  component.view = fakeField();
  const nearbyGlow = () => parseFloat(component.view.cells.find((cell) => cell.className === 'm lit')?.glow || 0);
  component.renderField();
  const brightGlow = nearbyGlow();
  assert.ok(brightGlow > 0);
  assert.equal(component.view.cells.filter((cell) => cell.className === 'm').length, 2);
  const gridGlows = component.view.cells.filter((cell) => cell.className === 'e lit').map((cell) => cell.glow);
  assert.ok(new Set(gridGlows).size > 8);
  assert.ok(component.view.cells.some((cell) => cell.className === 'e'));
  component.world.entities[0].mass = P.STAR;
  component.renderField();
  assert.ok(nearbyGlow() < brightGlow);
  component.world.entities.shift();
  component.renderField();
  assert.ok(!component.view.cells.some((cell) => cell.className === 'e lit'));
});
