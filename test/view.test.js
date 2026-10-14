import assert from 'node:assert/strict';
import test from 'node:test';
import * as esbuild from 'esbuild';
import { P, ROW, ROLE, GLYPHS } from '../src/sim/constants.js';
import { eventCounts, starPower } from '../src/sim/entities.js';
import { resizeWorld } from '../src/sim/world.js';

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

test('reset at a zoomed-out size keeps the unzoomed matter baseline', () => {
  const component = Object.create(Cosmordial.prototype);
  component.defaultDimensions = () => ({ cols: 80, rows: 30 });
  component.simulationDimensions = () => ({ cols: 160, rows: 30 });
  component.getAttribute = () => 'soup';
  component.opts = { G: P.G, boundary: 'box' };
  component.draw = () => {};
  component.updateFieldLayout = () => {};
  component.sync = () => {};
  component.reset();
  assert.equal(component.world.cols * component.world.rows, 2 * component.world.matterBaseArea);
});

test('reset seeds at the base size before shrinking a zoomed field', () => {
  const originalRandom = Math.random;
  try {
    for (const [preset, seed] of [['orbit', 3], ['binary', 1]]) {
      let state = seed;
      Math.random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 0x100000000);
      const component = Object.create(Cosmordial.prototype);
      component.defaultDimensions = () => ({ cols: 24, rows: 24 });
      component.simulationDimensions = () => ({ cols: 12, rows: 12 });
      component.getAttribute = () => preset;
      component.opts = { G: P.G, boundary: 'box' };
      component.draw = () => {};
      component.updateFieldLayout = () => {};
      component.sync = () => {};
      component.reset();
      assert.deepEqual([component.world.cols, component.world.rows, component.world.matterBaseArea], [12, 12, 576]);
      assert.ok(component.world.entities.every((e) => e.x >= 0 && e.x < 12 && e.y >= 0 && e.y < 12 * ROW), preset);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('a paused compact field repaints when its theme or boundary changes', () => {
  const previousDocument = globalThis.document;
  try {
    const component = Object.create(Cosmordial.prototype);
    component.fieldFrame = {};
    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document = { fullscreenElement: component };
    component.compactCanvas = {};
    component.zoom = 0.2;
    component.world = {};
    component.opts = {};
    component.getAttribute = () => 'amber';
    component.sync = () => {};
    let renders = 0;
    component.renderField = () => { renders++; };
    component.attributeChangedCallback('theme');
    component.attributeChangedCallback('boundary');
    assert.equal(renders, 2);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('width and height attributes size the visible field without resetting the world', () => {
  assert.ok(Cosmordial.observedAttributes.includes('width'));
  assert.ok(Cosmordial.observedAttributes.includes('height'));
  const component = Object.create(Cosmordial.prototype);
  const attributes = { width: '800', height: '450', cols: '90', rows: '35' };
  component.getAttribute = (name) => attributes[name] ?? null;
  component.hasAttribute = (name) => name in attributes;
  component.fieldScroller = { style: {} };
  component.world = {};
  assert.deepEqual(component.defaultDimensions(), { cols: 90, rows: 35 });
  component.reset = () => assert.fail('pixel dimensions must not reset the world');
  component.sync = () => {};
  component.attributeChangedCallback('width');
  component.attributeChangedCallback('height');
  assert.equal(component.fieldScroller.style.width, '800px');
  assert.equal(component.fieldScroller.style.height, '450px');
  attributes.width = '5000';
  delete attributes.height;
  component.attributeChangedCallback('width');
  assert.equal(component.fieldScroller.style.width, '');
  assert.equal(component.fieldScroller.style.height, '');
});

test('a pixel-sized field fits inside the scroller borders', () => {
  const previousStyle = globalThis.getComputedStyle;
  try {
    const component = Object.create(Cosmordial.prototype);
    const attributes = { width: '120', height: '100' };
    component.getAttribute = (name) => attributes[name] ?? null;
    component.hasAttribute = (name) => name in attributes;
    component.world = { cols: 10, rows: 5 };
    component.fieldFrame = {};
    component.fieldScroller = { clientWidth: 118, clientHeight: 98 };
    component.view = { style: { setProperty() {} } };
    component.measureField = () => ({ fontSize: 10, cellWidth: 6 });
    globalThis.getComputedStyle = (element) => element === component.fieldScroller
      ? { borderLeftWidth: '1px', borderRightWidth: '1px', borderTopWidth: '1px', borderBottomWidth: '1px' }
      : {};
    component.updateFieldLayout();
    assert.equal(component.view.style.width, '118px');
    assert.equal(component.view.style.height, '98px');
  } finally {
    globalThis.getComputedStyle = previousStyle;
  }
});

test('requested and automatic fields fit a constrained container', () => {
  const previousStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({
    borderLeftWidth: '1px', borderRightWidth: '1px',
    borderTopWidth: '1px', borderBottomWidth: '1px',
  });
  try {
    for (const attributes of [
      { width: '800', height: '450' }, { width: '800' }, { height: '450' }, {},
    ]) {
      const component = Object.create(Cosmordial.prototype);
      component.getAttribute = (name) => attributes[name] ?? null;
      component.hasAttribute = (name) => name in attributes;
      component.world = { cols: 80, rows: 30 };
      component.fieldFrame = {};
      component.fieldScroller = { clientWidth: 358, clientHeight: 448 };
      component.view = { style: { setProperty() {} } };
      component.measureField = () => ({ fontSize: 16, cellWidth: 9.6 });
      component.updateFieldLayout();
      assert.equal(component.view.style.width, '358px');
      const height = parseFloat(component.view.style.height);
      const fontSize = parseFloat(component.view.style.fontSize);
      assert.ok(80 * 9.6 * fontSize / 16 <= 358 + 1e-9);
      assert.ok(30 * fontSize * 1.15 <= height + 1e-9);
      assert.ok(Math.abs(height - ('height' in attributes ? 448 : 30 * 16 * 1.15 * 358 / 768)) < 1e-9);
      // Reflow again after the host becomes narrower, without resetting it.
      component.fieldScroller.clientWidth = 238;
      component.updateFieldLayout();
      assert.equal(component.view.style.width, '238px');
      component.fieldScroller.clientWidth = 1000;
      component.updateFieldLayout();
      assert.ok(parseFloat(component.view.style.width) > 358);
    }
  } finally {
    globalThis.getComputedStyle = previousStyle;
  }
});

test('fullscreen has no F keyboard shortcut', () => {
  const component = Object.create(Cosmordial.prototype);
  component.toggleFullscreen = () => assert.fail('fullscreen must use its button');
  assert.equal(component.key('f'), false);
});

test('the field fills configured pixels and fullscreen zoom preserves the viewport', () => {
  const getComputedStyle = globalThis.getComputedStyle;
  const document = globalThis.document;
  globalThis.getComputedStyle = () => ({});
  try {
    const component = Object.create(Cosmordial.prototype);
    const attributes = { width: '120', height: '100', cols: '10', rows: '5' };
    component.getAttribute = (name) => attributes[name] ?? null;
    component.hasAttribute = (name) => name in attributes;
    component.world = { cols: 10, rows: 5, w: 10, h: 5 * ROW, entities: [], trails: new Float32Array(50), flash: new Float32Array(50) };
    component.opts = { boundary: 'box' };
    component.fieldFrame = {};
    component.fieldScroller = { style: {}, clientWidth: 120, clientHeight: 100 };
    component.view = { style: { setProperty(name, value) { this[name] = value; } } };
    component.measureField = () => ({ fontSize: 10, cellWidth: 6 });
    component.syncFieldTools = () => {};
    component.renderStatus = () => {};
    component.zoom = 1;

    component.updateFieldLayout();
    assert.equal(component.view.style.width, '120px');
    assert.equal(component.view.style.height, '100px');
    assert.ok(component.view.style.fontSize.startsWith('17.391'));
    component.adjustZoom(0.25);
    assert.equal(component.zoom, 1);
    assert.equal(component.key('+'), false);
    assert.equal(component.key('-'), false);

    let exited = false;
    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document = { fullscreenElement: component, exitFullscreen() { exited = true; } };
    component.fieldScroller.clientWidth = 300;
    component.fieldScroller.clientHeight = 200;
    component.renderField = () => {};
    component.updateFieldSize();
    component.updateFieldLayout();
    component.adjustZoom(0.1);
    assert.equal(component.zoom, 1.1);
    assert.equal(component.world.cols, 9);
    assert.equal(component.view.style.zoom, '1');
    component.setZoom(0.2);
    const zoomLevels = [component.zoom];
    for (let i = 0; i < 14; i++) {
      component.adjustZoom(1);
      zoomLevels.push(component.zoom);
    }
    assert.deepEqual(zoomLevels, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.35, 1.5, 1.75, 2]);
    component.adjustZoom(1);
    assert.equal(component.zoom, 2);
    component.setZoom(4);
    assert.equal(component.zoom, 2);
    const reverseLevels = [component.zoom];
    for (let i = 0; i < 14; i++) {
      component.adjustZoom(-1);
      reverseLevels.push(component.zoom);
    }
    assert.deepEqual(reverseLevels, zoomLevels.slice().reverse());
    component.setZoom(0.1);
    assert.equal(component.zoom, 0.2);
    component.adjustZoom(-1);
    assert.equal(component.zoom, 0.2);
    assert.equal(component.world.cols, 50);
    assert.equal(component.world.rows, 25);
    assert.equal(component.fieldScroller.style.width, '100%');
    assert.equal(component.view.style.width, '300px');
    assert.equal(component.view.style.height, '200px');
    component.toggleFullscreen();
    assert.equal(exited, true);
    component.shadowRoot.fullscreenElement = null;
    component.fieldFrame.matches = (selector) => selector === ':fullscreen';
    assert.equal(component.isFieldFullscreen(), true);
    component.fieldFrame.matches = () => false;
    assert.equal(component.isFieldFullscreen(), false);
  } finally {
    globalThis.getComputedStyle = getComputedStyle;
    globalThis.document = document;
  }
});

test('entering fullscreen expands the field when the document reports the shadow host', () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({});
  try {
    const component = Object.create(Cosmordial.prototype);
    let fullscreenChange;
    let browserZoomKey;
    let browserZoomWheel;
    globalThis.document = {
      fullscreenElement: null,
      addEventListener(name, listener) { if (name === 'keydown') browserZoomKey = listener; },
    };
    component.fieldFrame = { addEventListener(name, listener) {
      if (name === 'fullscreenchange') fullscreenChange = listener;
      if (name === 'wheel') browserZoomWheel = listener;
    } };
    component.fieldScroller = { style: {}, clientWidth: 300, clientHeight: 200 };
    component.view = { style: { setProperty() {} } };
    component.world = { cols: 10, rows: 5, w: 10, h: 5 * ROW, entities: [], trails: new Float32Array(50), flash: new Float32Array(50) };
    component.zoom = 1;
    component.getAttribute = (name) => ({ theme: 'ansi', autoplay: 'false', width: '120', height: '100', cols: '10', rows: '5' })[name] ?? null;
    component.hasAttribute = (name) => ['theme', 'autoplay', 'width', 'height', 'cols', 'rows'].includes(name);
    component.measureField = () => ({ fontSize: 10, cellWidth: 6 });
    component.renderField = () => {};
    component.renderStatus = () => {};
    component.syncFieldTools = () => {};
    component.sync = () => {};
    component.connectedCallback();
    assert.equal(component.fieldScroller.style.width, '120px');
    assert.equal(typeof fullscreenChange, 'function');

    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document.fullscreenElement = component;
    fullscreenChange();
    assert.equal(component.fieldScroller.style.width, '100%');
    assert.equal(component.fieldScroller.style.height, '100%');
    assert.equal(component.view.style.width, '300px');
    assert.equal(component.view.style.height, '200px');
    let prevented = false;
    let stopped = false;
    browserZoomKey({ ctrlKey: true, code: 'Equal', key: '+', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(component.zoom, 1.1);
    assert.equal(component.world.cols, 9);
    browserZoomKey({ metaKey: true, code: 'Digit0', key: '0', preventDefault() {}, stopPropagation() {} });
    assert.equal(component.zoom, 1);
    prevented = false;
    browserZoomWheel({ ctrlKey: true, deltaY: 90, deltaMode: 0, timeStamp: 1000, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(component.zoom, 0.9);
  } finally {
    globalThis.document = previousDocument;
    globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('fullscreen zoom resizes the simulated world and fills the viewport', () => {
  const document = globalThis.document;
  try {
    const component = Object.create(Cosmordial.prototype);
    component.fieldFrame = {};
    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document = { fullscreenElement: component };
    component.view = fakeField();
    component.getAttribute = (name) => ({ cols: '4', rows: '2' })[name] ?? null;
    component.hasAttribute = (name) => ['cols', 'rows'].includes(name);
    component.syncFieldTools = () => {};
    component.renderStatus = () => {};
    component.world = {
      cols: 4, rows: 2, w: 4, h: 2 * ROW,
      entities: [{ x: 1, y: ROW / 2, mass: P.MATTER }],
      trails: new Float32Array(8), flash: new Float32Array(8),
    };
    component.opts = { boundary: 'box' };
    component.zoom = 1;
    component.setZoom(0.5);
    const wide = component.renderField();
    assert.equal(component.world.cols, 8);
    assert.equal(component.world.rows, 4);
    assert.equal(component.fieldCols, 8);
    assert.equal(component.fieldRows, 4);
    assert.equal(wide.glyphs.length, 32);
    assert.equal(wide.glyphs[11], GLYPHS[ROLE.FOOD]);
    assert.equal(wide.glyphs[0], '·');

    component.setZoom(2);
    const close = component.renderField();
    assert.equal(component.world.cols, 2);
    assert.equal(component.world.rows, 1);
    assert.equal(component.fieldCols, 2);
    assert.equal(component.fieldRows, 1);
    assert.deepEqual(close.glyphs, [GLYPHS[ROLE.FOOD], '·']);
  } finally {
    globalThis.document = document;
  }
});

test('resizing the world moves its centered contents and updates physical boundaries', () => {
  const world = {
    cols: 4, rows: 2, w: 4, h: 2 * ROW,
    entities: [{ x: 1, y: ROW / 2 }, { x: 3.5, y: ROW / 2 }],
    trails: Float32Array.from([0, 0, 0, 0, 0, 1, 0, 0]),
    flash: Float32Array.from([0, 0, 0, 0, 0, 0.5, 0, 0]),
  };
  resizeWorld(world, 8, 4);
  assert.deepEqual([world.cols, world.rows, world.w, world.h], [8, 4, 8, 4 * ROW]);
  assert.equal(world.entities[0].x, 3);
  assert.equal(world.trails[2 * 8 + 3], 1);
  assert.equal(world.flash[2 * 8 + 3], 0.5);
  resizeWorld(world, 2, 1);
  assert.deepEqual([world.cols, world.rows, world.w, world.h], [2, 1, 2, ROW]);
  assert.equal(world.entities.length, 1);
  assert.equal(world.entities[0].x, 0);
  assert.equal(world.trails.length, 2);
});

test('20% fullscreen zoom renders densely without creating a cell element per grid slot', () => {
  const previousDocument = globalThis.document;
  const previousStyle = globalThis.getComputedStyle;
  try {
    const component = Object.create(Cosmordial.prototype);
    const draws = [];
    let fills = 0;
    const context = {
      setTransform() {}, fillRect(...args) { draws.push(args); },
      beginPath() {}, moveTo() {}, arc(...args) { draws.push(args); }, fill() { fills++; },
      createRadialGradient() { return { addColorStop() {} }; },
    };
    component.fieldFrame = {};
    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document = { fullscreenElement: component };
    component.fieldScroller = { clientWidth: 100, clientHeight: 60 };
    component.compactCanvas = { style: {}, width: 0, height: 0, getContext: () => context };
    component.view = fakeField();
    component.getAttribute = (name) => ({ cols: '4', rows: '2' })[name] ?? null;
    component.hasAttribute = (name) => ['cols', 'rows'].includes(name);
    component.world = {
      cols: 4, rows: 2, w: 4, h: 2 * ROW,
      entities: [{ x: 1, y: ROW / 2, mass: P.MATTER }, { x: 2, y: ROW / 2, mass: P.MATTER }],
      trails: new Float32Array(8), flash: new Float32Array(8),
    };
    component.opts = { boundary: 'box' };
    component.zoom = 1;
    component.renderStatus = () => {};
    component.syncFieldTools = () => {};
    component.renderField();
    assert.equal(component.fieldCells.length, 8);
    component.setZoom(0.2);
    assert.deepEqual([component.world.cols, component.world.rows], [20, 10]);
    assert.deepEqual([component.compactCanvas.width, component.compactCanvas.height], [100, 60]);
    assert.equal(component.view.style.display, 'none');
    assert.equal(component.view.cells.length, 0);
    assert.equal(component.fieldCells, null);
    assert.equal(component.lastGlow, null);
    assert.equal(draws.filter((args) => args.length === 4).length, 1);
    assert.ok(draws.length >= 2);
    assert.equal(fills, 1);
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => name === '--food' ? 'rgba(140, 150, 160, 0.5)' : '' });
    fills = 0;
    component.renderCompactField();
    assert.equal(fills, 2);
    globalThis.getComputedStyle = previousStyle;
    component.setZoom(0.4);
    assert.equal(component.view.style.display, '');
    assert.equal(component.compactCanvas.style.display, 'none');
    assert.equal(component.compactCanvas.width, 0);
    assert.equal(component.compactCanvas.height, 0);
    assert.equal(component.fieldCells.length, component.world.cols * component.world.rows);
  } finally {
    globalThis.document = previousDocument;
    globalThis.getComputedStyle = previousStyle;
  }
});

test('compact star glow wraps across torus edges', () => {
  const component = Object.create(Cosmordial.prototype);
  const centers = [];
  const context = {
    setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, arc() {}, fill() {},
    createRadialGradient(x, y) {
      centers.push([x, y]);
      return { addColorStop() {} };
    },
  };
  component.compactCanvas = { width: 0, height: 0, getContext: () => context };
  component.fieldScroller = { clientWidth: 100, clientHeight: 60 };
  component.world = {
    cols: 80, rows: 30,
    entities: [{ x: 0.5, y: 1, mass: 35 }],
    trails: new Float32Array(80 * 30), flash: new Float32Array(80 * 30),
  };
  component.opts = { boundary: 'box' };
  component.renderCompactField();
  assert.equal(centers.length, 1);
  component.opts.boundary = 'torus';
  centers.length = 0;
  component.renderCompactField();
  assert.ok(centers.some(([x, y]) => x > 100 && y > 60));
});

test('mobile fullscreen uses roughly square grid cells at every zoom level', () => {
  const previousMatchMedia = globalThis.matchMedia;
  const previousDocument = globalThis.document;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    const component = Object.create(Cosmordial.prototype);
    component.fieldFrame = {};
    component.shadowRoot = { fullscreenElement: component.fieldFrame };
    globalThis.document = { fullscreenElement: component };
    component.fieldScroller = { clientWidth: 390, clientHeight: 780 };
    component.defaultDimensions = () => ({ cols: 24, rows: 22 });
    component.zoom = 1;
    assert.deepEqual(component.simulationDimensions(), { cols: 24, rows: 48 });
    component.zoom = 0.2;
    assert.deepEqual(component.simulationDimensions(), { cols: 120, rows: 240 });
  } finally {
    globalThis.matchMedia = previousMatchMedia;
    globalThis.document = previousDocument;
  }
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

test('unchanged field cells are left untouched while changed cells still update', () => {
  const component = Object.create(Cosmordial.prototype);
  component.view = fakeField();
  const glyphs = ['·', '·'];
  const ink = ['e', 'e'];
  const glow = new Uint8Array(2);
  component.paintField(2, 1, glyphs, ink, glow);
  const untouched = component.view.cells[0];
  Object.defineProperty(untouched, 'className', { get() { throw new Error('unchanged class was read'); } });
  Object.defineProperty(untouched, 'textContent', { get() { throw new Error('unchanged glyph was read'); } });
  untouched.style.setProperty = () => { throw new Error('unchanged glow was written'); };
  component.paintField(2, 1, [...glyphs], [...ink], glow.slice());
  component.paintField(2, 1, ['·', 'x'], ['e', 'b'], glow.slice());
  assert.equal(component.view.cells[1].textContent, 'x');
  assert.equal(component.view.cells[1].className, 'b');
});

test('mobile field uses single-width marks and switches back without rebuilding cells', () => {
  const matchMedia = globalThis.matchMedia;
  let mobile = true;
  globalThis.matchMedia = () => ({ matches: mobile });
  try {
    const component = Object.create(Cosmordial.prototype);
    component.view = fakeField();
    const glyphs = [GLYPHS[ROLE.FOOD], GLYPHS[ROLE.ROCK], GLYPHS[ROLE.STAR], GLYPHS[ROLE.CELL], GLYPHS[ROLE.FORAGER], GLYPHS[ROLE.HUNTER], '░', '·'];
    const ink = ['m', 'r', 's', 'a', 'f', 'h', 'x', 'e'];
    component.paintField(8, 1, glyphs, ink, new Uint8Array(8));
    assert.deepEqual(component.view.cells.map((cell) => cell.textContent), [':', 'O', '*', 'o', '>', 'A', '.', '.']);
    const cells = component.view.cells.slice();
    mobile = false;
    component.paintField(8, 1, glyphs, ink, new Uint8Array(8));
    assert.equal(component.view.cells[0], cells[0]);
    assert.deepEqual(component.view.cells.map((cell) => cell.textContent), glyphs);
  } finally {
    globalThis.matchMedia = matchMedia;
  }
});

test('field returns independent snapshots and clears marks when entities move away', () => {
  const component = Object.create(Cosmordial.prototype);
  component.world = {
    cols: 2, rows: 1,
    entities: [{ x: 0, y: 0, mass: P.MATTER }],
    trails: new Float32Array(2), flash: new Float32Array(2),
  };
  component.view = fakeField();
  const first = component.renderField();
  assert.equal(first.glyphs[0], GLYPHS[ROLE.FOOD]);
  component.world.entities = [];
  const second = component.renderField();
  assert.notEqual(second.glyphs, first.glyphs);
  assert.notEqual(second.glow, first.glow);
  assert.equal(first.glyphs[0], GLYPHS[ROLE.FOOD]);
  assert.equal(component.view.cells[0].textContent, '·');
});

test('population histories stay bounded beyond 20000 ticks', () => {
  const component = Object.create(Cosmordial.prototype);
  component.history = [];
  component.speciesHistory = [];
  component.opts = { speed: 25 };
  component.raf = 1;
  component.updateSparkline = () => {};
  for (let tick = 1; tick <= 25000; tick++) {
    component.recordPopulation({ tick, pop: tick, counts: { [GLYPHS[ROLE.CELL]]: tick } });
    assert.ok(component.history.length <= 721);
    assert.ok(component.speciesHistory.length <= 721);
  }
  assert.equal(component.history[0], 25000 - 720);
  assert.equal(component.history.at(-1), 25000);
  assert.deepEqual(component.speciesHistory.at(-1), [25000, 0, 0, 0, 0]);
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

test('mobile moving glyphs keep direction with narrow characters', () => {
  const matchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const cases = [
      [ROLE.FORAGER, 0, -1, '^'], [ROLE.FORAGER, 1, 0, '>'],
      [ROLE.FORAGER, 0, 1, 'v'], [ROLE.FORAGER, -1, 0, '<'],
      [ROLE.HUNTER, 0, -1, 'A'], [ROLE.HUNTER, 1, 0, ']'],
      [ROLE.HUNTER, 0, 1, 'V'], [ROLE.HUNTER, -1, 0, '['],
    ];
    for (const [role, vx, vy, expected] of cases) {
      const g = role === ROLE.FORAGER ? [0, 0.8, 0, 0, 0, 0, 0] : [0, 0, 0.8, 0, 0, 0, 0];
      const component = Object.create(Cosmordial.prototype);
      component.world = { cols: 1, rows: 1, entities: [{ x: 0, y: 0, vx, vy, g }], trails: [0], flash: [0] };
      component.view = fakeField();
      component.renderField();
      assert.equal(component.view.cells[0].textContent, expected, `${role} at (${vx}, ${vy})`);
    }
  } finally {
    globalThis.matchMedia = matchMedia;
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

test('bounded starlight matches full-grid accumulation exactly', () => {
  const cols = 40;
  const rows = 12;
  const stars = [
    { x: 0.6, y: 1.2, mass: 35 },
    { x: 38.7, y: 20.1, mass: 20 },
    { x: 17.3, y: 9.4, mass: 48 },
  ];
  for (const boundary of ['box', 'torus']) {
    const component = Object.create(Cosmordial.prototype);
    component.opts = { boundary };
    component.world = { cols, rows, entities: stars, trails: new Float32Array(cols * rows), flash: new Float32Array(cols * rows) };
    component.view = fakeField();
    const { glow } = component.renderField();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (stars.some((s) => Math.floor(s.x) === x && Math.floor(s.y / ROW) === y)) continue;
        let strength = 0;
        for (const star of stars) {
          const power = starPower(star);
          const reach = P.LIGHT_R * Math.sqrt(power);
          let dx = x + 0.5 - star.x;
          let dy = (y + 0.5) * ROW - star.y;
          if (boundary === 'torus' && Math.abs(dx) > cols / 2) dx -= Math.sign(dx) * cols;
          if (boundary === 'torus' && Math.abs(dy) > rows * ROW / 2) dy -= Math.sign(dy) * rows * ROW;
          if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
          const distance = Math.hypot(dx, dy);
          if (distance < reach) strength += power * (1 - distance / reach) ** 1.5;
        }
        const level = Math.round(Math.min(1, strength / 0.65) * 32);
        assert.equal(glow[y * cols + x], Math.round(level * 100 / 32), `${boundary} cell ${x},${y}`);
      }
    }
  }
});
