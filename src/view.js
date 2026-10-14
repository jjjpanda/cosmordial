import css from './style.css';
import { createWorld, resizeWorld, tick, census, glyph, P, ROW, PRESETS } from './sim.js';
import { ROLE, GLYPHS } from './sim/constants.js';
import { starPower } from './sim/entities.js';

const THEMES = ['ansi', 'green', 'amber', 'colorblind'];
const SHADE = '░▒▓';
const MIN_FACING_SPEED = 0.05;
const LIGHT_LEVELS = 32;
const ZOOM_LEVELS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.35, 1.5, 1.75, 2];
const COMPACT_ZOOM = 0.4;
const DIMENSIONS = { width: [80, 4096], height: [80, 2160] };
const FACING = {
  [GLYPHS[ROLE.FORAGER]]: { up: '↑', right: '→', down: '↓', left: '←' },
  [GLYPHS[ROLE.HUNTER]]: { up: '▲', right: '►', down: '▼', left: '◄' },
};
const MOBILE_GLYPHS = {
  '·': '.',
  [SHADE[0]]: '.',
  [SHADE[1]]: ':',
  [SHADE[2]]: '#',
  [GLYPHS[ROLE.FOOD]]: ':',
  [GLYPHS[ROLE.ROCK]]: 'O',
  [GLYPHS[ROLE.STAR]]: '*',
  [GLYPHS[ROLE.CELL]]: 'o',
  [GLYPHS[ROLE.HELIOTROPE]]: '+',
  [GLYPHS[ROLE.PARASITE]]: 'x',
  [FACING[GLYPHS[ROLE.FORAGER]].up]: '^',
  [FACING[GLYPHS[ROLE.FORAGER]].right]: '>',
  [FACING[GLYPHS[ROLE.FORAGER]].down]: 'v',
  [FACING[GLYPHS[ROLE.FORAGER]].left]: '<',
  [FACING[GLYPHS[ROLE.HUNTER]].up]: 'A',
  [FACING[GLYPHS[ROLE.HUNTER]].right]: ']',
  [FACING[GLYPHS[ROLE.HUNTER]].down]: 'V',
  [FACING[GLYPHS[ROLE.HUNTER]].left]: '[',
};
const MOBILE_LEGEND_GLYPHS = {
  ...MOBILE_GLYPHS,
  [GLYPHS[ROLE.FORAGER]]: 'f',
  [GLYPHS[ROLE.HUNTER]]: 'H',
};
const CLS = {
  '·': 'e',
  [GLYPHS[ROLE.FOOD]]: 'm',
  [GLYPHS[ROLE.ROCK]]: 'r',
  [GLYPHS[ROLE.STAR]]: 's',
  [GLYPHS[ROLE.CELL]]: 'a',
  [GLYPHS[ROLE.HUNTER]]: 'h',
  [GLYPHS[ROLE.HELIOTROPE]]: 'p',
  [GLYPHS[ROLE.PARASITE]]: 'b',
  [GLYPHS[ROLE.FORAGER]]: 'f',
};
const LEGEND = [
  ROLE.FOOD, ROLE.ROCK, ROLE.STAR, ROLE.CELL,
  ROLE.HUNTER, ROLE.HELIOTROPE, ROLE.PARASITE, ROLE.FORAGER,
];
const SPECIES = [ROLE.CELL, ROLE.FORAGER, ROLE.HELIOTROPE, ROLE.HUNTER, ROLE.PARASITE];
const HATCH = {
  [ROLE.CELL]: 'M0 2H4',
  [ROLE.FORAGER]: 'M2 0V4',
  [ROLE.HELIOTROPE]: 'M-2 4L4 -2 M0 6L6 0',
  [ROLE.HUNTER]: 'M-2 0L4 6 M0 -2L6 4',
  [ROLE.PARASITE]: 'M-2 4L4 -2 M0 6L6 0 M-2 0L4 6 M0 -2L6 4',
};
const HATCH_MARK = {
  [ROLE.CELL]: '─',
  [ROLE.FORAGER]: '│',
  [ROLE.HELIOTROPE]: '/',
  [ROLE.HUNTER]: '\\',
  [ROLE.PARASITE]: '╳',
};
let hatchSequence = 0;
const legendItem = (role) => {
  const mark = GLYPHS[role];
  return `<span data-g="${mark}"><b class="${CLS[mark]}"><span class="wide-glyph">${mark}</span><span class="mobile-glyph">${MOBILE_LEGEND_GLYPHS[mark]}</span></b> ${role} <small>0</small></span>`;
};
const movingGlyph = (e, base) => {
  const facing = FACING[base];
  if (!facing) return base;
  const vx = e.vx ?? 0;
  const vy = e.vy ?? 0;
  if (vx * vx + vy * vy < MIN_FACING_SPEED ** 2) return base;
  return Math.abs(vx) >= Math.abs(vy)
    ? (vx >= 0 ? facing.right : facing.left)
    : (vy >= 0 ? facing.down : facing.up);
};

const num = (el, name, def) => {
  const value = Number(el.getAttribute(name));
  return el.hasAttribute(name) && Number.isFinite(value) ? value : def;
};
const pixelSize = (el, name) => {
  const value = num(el, name, NaN);
  const [min, max] = DIMENSIONS[name];
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
};

export class Cosmordial extends (globalThis.HTMLElement ?? class {}) {
  static observedAttributes = ['width', 'height', 'cols', 'rows', 'preset', 'theme', 'speed', 'gravity', 'mutation', 'boundary', 'autoplay', 'trail-length'];

  constructor() {
    super();
    const hatchPrefix = `cosmordial-hatch-${++hatchSequence}`;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>
<div class="layout">
<div class="controls">
<nav>
  <button data-k=" "><span class="shortcut">[spc]</span> <span class="action"></span></button>
  <button data-k="s"><span class="shortcut">[s]</span> <span class="action">step</span></button>
  <button data-k="r"><span class="shortcut">[r]</span> <span class="action">reset</span></button>
  <span class="nav-break" aria-hidden="true"></span>
  ${PRESETS.map((p, i) => `<button data-k="${i + 1}" data-p="${p}"><span class="shortcut">[${i + 1}]</span> <span class="action">${p}</span></button>`).join('')}
  <span class="nav-break" aria-hidden="true"></span>
  <button data-k="b"><span class="shortcut">[b]</span> <span class="action"></span></button>
  <button data-k="t"><span class="shortcut">[t]</span> <span class="action"></span></button>
</nav>
<div class="settings" role="group" aria-label="Settings">
  <label><span>speed</span><span class="setting-control"><input name="speed" type="range" min="1" max="60"><output></output></span></label>
  <label><span>gravity</span><span class="setting-control"><input name="G" type="range" min="0" max="0.5" step="0.02"><output></output></span></label>
  <label><span>mutation</span><span class="setting-control"><input name="mutation" type="range" min="0" max="0.5" step="0.01"><output></output></span></label>
  <label><span>trail length</span><span class="setting-control"><input name="trailLength" type="range" min="0" max="20"><output></output></span></label>
</div>
<section class="legend" aria-label="Legend">
  <strong>LEGEND</strong>
  ${LEGEND.map(legendItem).join('')}
</section>
</div>
<div class="field-frame"><div class="field-scroller"><div class="u" role="img" aria-label="Simulation field"></div><canvas class="compact-field" role="img" aria-label="Simulation field"></canvas></div><div class="field-tools" role="group" aria-label="Field view controls"><span class="zoom-tools"><button data-field="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><output class="zoom-readout">100%</output><button data-field="zoom-in" aria-label="Zoom in" title="Zoom in">+</button></span><button data-field="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen">⛶</button></div></div>
<div class="status">
  <div class="status-heading">NOW</div>
  <pre class="stats"></pre>
  <div class="pophead"></div>
  <svg class="sparkline" viewBox="0 0 120 30" preserveAspectRatio="none" role="img" aria-label="Population history"><polyline points=""></polyline></svg>
  <div class="status-heading">SPECIES HISTORY</div>
  <svg class="species-chart" viewBox="0 0 120 30" preserveAspectRatio="none" role="img" aria-label="Species population history">
    <defs>${SPECIES.map((role) => `<pattern id="${hatchPrefix}-${role}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4"></rect><path d="${HATCH[role]}"></path></pattern>`).join('')}</defs>
    ${SPECIES.map((role) => `<path class="species-${role}" style="--hatch:url(#${hatchPrefix}-${role})" d=""></path>`).join('')}
  </svg>
  <div class="species-key">${SPECIES.map((role) => `<span><b class="${CLS[GLYPHS[role]]}" aria-hidden="true"><span class="wide-glyph">■</span><span class="mobile-glyph">${MOBILE_LEGEND_GLYPHS[GLYPHS[role]]}</span></b><i aria-hidden="true">${HATCH_MARK[role]}</i> ${role}</span>`).join('')}</div>
  <div class="status-heading">EVENTS SINCE RESET</div>
  <pre class="events"></pre>
</div>
</div>`;
    this.view = root.querySelector('.u');
    this.fieldFrame = root.querySelector('.field-frame');
    this.fieldScroller = root.querySelector('.field-scroller');
    this.compactCanvas = root.querySelector('.compact-field');
    this.zoom = 1;
    this.status = root.querySelector('.stats');
    this.events = root.querySelector('.events');
    this.pophead = root.querySelector('.pophead');
    this.sparkline = root.querySelector('.sparkline');
    this.sparklineLine = root.querySelector('.sparkline polyline');
    this.speciesChart = root.querySelector('.species-chart');
    this.speciesPaths = SPECIES.map((role) => root.querySelector(`.species-${role}`));
    root.addEventListener('mousedown', (e) => e.target.closest?.('button[data-k]') && e.preventDefault());
    root.addEventListener('click', (e) => {
      const button = e.target.closest?.('button[data-k]');
      if (button) this.key(button.dataset.k);
      const fieldButton = e.target.closest?.('button[data-field]');
      if (fieldButton?.dataset.field === 'zoom-in') this.adjustZoom(1);
      if (fieldButton?.dataset.field === 'zoom-out') this.adjustZoom(-1);
      if (fieldButton?.dataset.field === 'fullscreen') this.toggleFullscreen();
    });
    root.addEventListener('input', (e) => {
      if (e.target.type !== 'range') return;
      this.opts[e.target.name] = Number(e.target.value);
      if (e.target.name === 'trailLength' && !this.opts.trailLength) {
        this.world.trails.fill(0);
        this.renderField();
      }
      this.sync();
      if (e.target.name === 'speed') this.updateSparkline();
    });
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0];
      if (this.isFieldFullscreen() && ['+', '=', '-', 'f'].includes(e.key.toLowerCase()) && !target.matches?.('input, select, textarea')) {
        if (this.key(e.key.toLowerCase())) e.preventDefault();
        return;
      }
      if (target.matches?.('button, input, select, summary')) return;
      if (this.key(e.key.toLowerCase())) e.preventDefault();
    });
  }

  connectedCallback() {
    if (!this.hasAttribute('theme')) this.setAttribute('theme', 'ansi');
    this.tabIndex = 0;
    this.opts ??= {
      speed: num(this, 'speed', 25),
      G: num(this, 'gravity', P.G),
      mutation: num(this, 'mutation', P.MUTATION),
      boundary: this.getAttribute('boundary') || 'box',
      trailLength: num(this, 'trail-length', P.TRAIL_LENGTH),
    };
    this.updateFieldSize();
    if (!this.world) this.reset();
    this.onFullscreenChange ??= () => {
      if (!this.isFieldFullscreen()) this.zoom = 1;
      this.updateFieldSize();
      const { cols, rows } = this.simulationDimensions();
      resizeWorld(this.world, cols, rows, this.opts.boundary);
      this.renderField();
      this.renderStatus(census(this.world));
      this.updateFieldLayout();
      this.syncFieldTools();
    };
    this.fieldFrame.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.onBrowserZoomKey ??= (event) => {
      if (!this.isFieldFullscreen() || !(event.ctrlKey || event.metaKey)) return;
      const code = event.code;
      const zoomIn = ['Equal', 'NumpadAdd'].includes(code) || ['+', '='].includes(event.key);
      const zoomOut = ['Minus', 'NumpadSubtract'].includes(code) || ['-', '_'].includes(event.key);
      const reset = ['Digit0', 'Numpad0'].includes(code) || event.key === '0';
      if (!zoomIn && !zoomOut && !reset) return;
      event.preventDefault();
      event.stopPropagation();
      if (reset) this.setZoom(1);
      else this.adjustZoom(zoomIn ? 1 : -1);
    };
    globalThis.document?.addEventListener('keydown', this.onBrowserZoomKey, true);
    this.onBrowserZoomWheel ??= (event) => {
      if (this.isFieldFullscreen() && (event.ctrlKey || event.metaKey)) event.preventDefault();
    };
    this.fieldFrame.addEventListener('wheel', this.onBrowserZoomWheel, { passive: false });
    this.syncFieldTools();
    if (globalThis.ResizeObserver) {
      this.resizeObserver ??= new ResizeObserver(() => {
        if (this.clientWidth === this.lastWidth) return;
        this.lastWidth = this.clientWidth;
        this.scheduleResize();
      });
      this.lastWidth = this.clientWidth;
      this.resizeObserver.observe(this);
    }
    this.onWindowResize ??= () => this.scheduleResize();
    globalThis.addEventListener?.('resize', this.onWindowResize);
    if (this.getAttribute('autoplay') !== 'false') this.play();
    else this.sync();
    if (this.hasAttribute('autofocus')) this.focus();
  }

  disconnectedCallback() {
    this.pause();
    this.resizeObserver?.disconnect();
    this.fieldFrame?.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.fieldFrame?.removeEventListener('wheel', this.onBrowserZoomWheel);
    globalThis.document?.removeEventListener('keydown', this.onBrowserZoomKey, true);
    globalThis.removeEventListener?.('resize', this.onWindowResize);
    clearTimeout(this.resizeTimer);
  }

  attributeChangedCallback(name) {
    if (!this.world) return;
    if (['cols', 'rows', 'preset'].includes(name)) this.reset();
    else if (name === 'width' || name === 'height') {
      this.updateFieldSize();
      this.updateFieldLayout();
    }
    else if (name === 'autoplay') this.getAttribute('autoplay') === 'false' ? this.pause() : this.play();
    else {
      if (name === 'speed') this.opts.speed = Math.max(1, num(this, name, 25));
      if (name === 'gravity') this.opts.G = num(this, name, P.G);
      if (name === 'mutation') this.opts.mutation = num(this, name, P.MUTATION);
      if (name === 'boundary') this.opts.boundary = this.getAttribute(name) || 'box';
      if (name === 'trail-length') this.opts.trailLength = num(this, name, P.TRAIL_LENGTH);
      if (name === 'trail-length' && !this.opts.trailLength) {
        this.world.trails.fill(0);
        this.renderField();
      }
      this.sync();
      if (this.isCompactZoom() && (name === 'theme' || name === 'boundary')) this.renderField();
      if (name === 'speed') this.updateSparkline();
    }
  }

  updateFieldSize() {
    const fullscreen = this.isFieldFullscreen();
    const width = pixelSize(this, 'width');
    const height = pixelSize(this, 'height');
    this.fieldScroller.style.width = fullscreen ? '100%' : width ? `${width}px` : '';
    this.fieldScroller.style.height = fullscreen ? '100%' : height ? `${height}px` : '';
  }

  measureField() {
    const previous = this.view.style.fontSize;
    this.view.style.fontSize = '';
    const style = getComputedStyle(this.view);
    const fontSize = parseFloat(style.fontSize);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) context.font = `${fontSize}px ${style.fontFamily}`;
    const cellWidth = context?.measureText('0').width || fontSize * 0.6;
    this.view.style.fontSize = previous;
    return { fontSize, cellWidth };
  }

  updateFieldLayout() {
    if (!this.world || !globalThis.getComputedStyle) return;
    if (this.isCompactZoom()) return;
    const { fontSize, cellWidth } = this.measureField();
    const cols = this.fieldCols || this.world.cols;
    const rows = this.fieldRows || this.world.rows;
    const naturalWidth = cols * cellWidth;
    const naturalHeight = rows * fontSize * 1.15;
    const fullscreen = this.isFieldFullscreen();
    let width = fullscreen ? this.fieldScroller.clientWidth : pixelSize(this, 'width');
    let height = fullscreen ? this.fieldScroller.clientHeight : pixelSize(this, 'height');
    if (width && !height) height = naturalHeight * width / naturalWidth;
    if (height && !width) width = naturalWidth * height / naturalHeight;
    width ||= naturalWidth;
    height ||= naturalHeight;
    this.view.style.width = `${width}px`;
    this.view.style.height = `${height}px`;
    this.view.style.fontSize = `${fontSize * Math.min(width / naturalWidth, height / naturalHeight)}px`;
    this.view.style.zoom = '1';
    this.view.style.setProperty('--rows', rows);
  }

  adjustZoom(direction) {
    if (!this.isFieldFullscreen() || !direction) return;
    const levels = direction > 0 ? ZOOM_LEVELS : ZOOM_LEVELS.slice().reverse();
    const next = levels.find((level) => direction > 0 ? level > this.zoom : level < this.zoom);
    if (next !== undefined) this.setZoom(next);
  }

  setZoom(zoom) {
    if (!this.isFieldFullscreen()) return;
    const level = ZOOM_LEVELS.reduce((closest, candidate) => Math.abs(candidate - zoom) < Math.abs(closest - zoom) ? candidate : closest);
    if (level === this.zoom) return;
    this.zoom = level;
    const { cols, rows } = this.simulationDimensions();
    resizeWorld(this.world, cols, rows, this.opts.boundary);
    this.renderField();
    this.renderStatus(census(this.world));
    this.updateFieldLayout();
    this.syncFieldTools();
  }

  toggleFullscreen() {
    if (this.isFieldFullscreen()) globalThis.document.exitFullscreen();
    else this.fieldFrame.requestFullscreen?.();
  }

  isFieldFullscreen() {
    return !!this.fieldFrame && (
      this.shadowRoot?.fullscreenElement === this.fieldFrame ||
      this.fieldFrame.matches?.(':fullscreen') ||
      globalThis.document?.fullscreenElement === this.fieldFrame
    );
  }

  syncFieldTools() {
    this.shadowRoot.querySelector('.zoom-readout').textContent = `${Math.round(this.zoom * 100)}%`;
    const button = this.shadowRoot.querySelector('[data-field="fullscreen"]');
    const label = this.isFieldFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  play() {
    if (this.raf) return;
    let last = 0;
    let carry = 0;
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (last) carry += Math.min(now - last, 250);
      last = now;
      const interval = 1000 / this.opts.speed;
      if (carry >= interval) {
        this.step();
        carry -= interval;
        // Keep a slow frame from forcing several redraws into the next one.
        if (carry >= interval) carry = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
    this.sync();
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sync();
  }

  step() {
    tick(this.world, this.opts);
    this.dispatchEvent(new CustomEvent('tick', { detail: this.draw() }));
  }

  reset() {
    const base = this.defaultDimensions();
    const { cols, rows } = this.simulationDimensions();
    this.world = createWorld(this.getAttribute('preset') || 'orbit', base.cols, base.rows, this.opts.G, this.opts.boundary);
    resizeWorld(this.world, cols, rows, this.opts.boundary);
    this.history = [];
    this.speciesHistory = [];
    this.draw();
    this.updateFieldLayout();
    this.sync();
  }

  defaultDimensions() {
    let cols = 80;
    let rows = 30;
    if (globalThis.matchMedia?.('(max-width: 600px)').matches) {
      const style = getComputedStyle(this);
      const { cellWidth } = this.measureField();
      const available = this.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      cols = Math.max(24, Math.min(80, Math.floor(available / cellWidth)));
      rows = 22;
    }
    return { cols: num(this, 'cols', cols), rows: num(this, 'rows', rows) };
  }

  simulationDimensions() {
    const { cols, rows } = this.defaultDimensions();
    if (!this.isFieldFullscreen()) return { cols, rows };
    const zoomedCols = Math.max(1, Math.round(cols / this.zoom));
    const width = this.fieldScroller?.clientWidth;
    const height = this.fieldScroller?.clientHeight;
    const mobile = globalThis.matchMedia?.('(max-width: 600px), (pointer: coarse)').matches;
    const zoomedRows = mobile && width && height
      ? Math.max(1, Math.round(zoomedCols * height / width))
      : Math.max(1, Math.round(rows / this.zoom));
    return { cols: zoomedCols, rows: zoomedRows };
  }

  isCompactZoom() {
    return this.isFieldFullscreen() && this.zoom < COMPACT_ZOOM && !!this.compactCanvas;
  }

  scheduleResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      if (!this.isConnected || !this.world) return;
      const { cols, rows } = this.simulationDimensions();
      if (this.isFieldFullscreen()) {
        resizeWorld(this.world, cols, rows, this.opts.boundary);
        this.renderField();
        this.renderStatus(census(this.world));
      }
      else if (Math.abs(this.world.cols - cols) >= 3 || this.world.rows !== rows) this.reset();
      else if (this.fieldMobile !== !!globalThis.matchMedia?.('(max-width: 600px)').matches) this.renderField();
      this.updateFieldLayout();
    }, 150);
  }

  key(k) {
    const preset = PRESETS[k - 1];
    if (k === ' ') this.raf ? this.pause() : this.play();
    else if (k === 's') this.step();
    else if (k === 'r') this.reset();
    else if (preset) this.setAttribute('preset', preset);
    else if (k === 'b') this.setAttribute('boundary', this.opts.boundary === 'torus' ? 'box' : 'torus');
    else if (k === 't') this.setAttribute('theme', THEMES[(THEMES.indexOf(this.getAttribute('theme')) + 1) % THEMES.length]);
    else if ((k === '+' || k === '=') && this.isFieldFullscreen()) this.adjustZoom(1);
    else if (k === '-' && this.isFieldFullscreen()) this.adjustZoom(-1);
    else if (k === 'f') this.toggleFullscreen();
    else return false;
    return true;
  }

  sync() {
    const root = this.shadowRoot;
    root.querySelector('[data-k=" "] .action').textContent = this.raf ? 'pause' : 'run';
    root.querySelector('[data-k="b"] .action').textContent = `boundary: ${this.opts.boundary}`;
    root.querySelector('[data-k="t"] .action').textContent = `theme: ${this.getAttribute('theme')}`;
    const preset = this.getAttribute('preset') || 'orbit';
    for (const b of root.querySelectorAll('[data-p]')) b.classList.toggle('on', b.dataset.p === preset);
    for (const i of root.querySelectorAll('input[type="range"]')) {
      i.value = this.opts[i.name];
      i.nextElementSibling.textContent = this.opts[i.name];
    }
  }

  updateSparkline() {
    if (!this.history?.length) return;
    const stride = Math.max(1, Math.round(this.opts.speed / 5));
    const indices = [];
    for (let i = this.history.length - 1; i >= 0 && indices.length < 60; i -= stride) indices.push(i);
    indices.reverse();
    const samples = indices.map((i) => this.history[i]);
    const low = Math.min(...samples);
    const high = Math.max(...samples);
    const points = samples.length === 1
      ? '0,15 120,15'
      : samples.map((v, i) => `${(120 * i / (samples.length - 1)).toFixed(1)},${high === low ? 15 : (28 - 26 * (v - low) / (high - low)).toFixed(1)}`).join(' ');
    const ticks = (samples.length - 1) * stride;
    this.sparklineLine.setAttribute('points', points);
    this.pophead.textContent = `POPULATION · ${ticks} TICKS · RANGE ${low}-${high}`;
    this.sparkline.setAttribute('aria-label', `Living cells over ${ticks} ticks: ${samples[0]} to ${samples.at(-1)}, range ${low} to ${high}`);

    const speciesSamples = indices.map((i) => this.speciesHistory[i]);
    if (speciesSamples.length === 1) speciesSamples.push(speciesSamples[0]);
    const max = Math.max(1, ...samples);
    const x = (i) => (120 * i / (speciesSamples.length - 1)).toFixed(1);
    const y = (count) => (28 - 26 * count / max).toFixed(1);
    let lower = speciesSamples.map(() => 0);
    for (let role = 0; role < SPECIES.length; role++) {
      const upper = lower.map((count, i) => count + speciesSamples[i][role]);
      const top = upper.map((count, i) => `${x(i)},${y(count)}`);
      const bottom = lower.map((count, i) => `${x(i)},${y(count)}`).reverse();
      this.speciesPaths[role].setAttribute('d', upper.some((count, i) => count > lower[i]) ? `M${top.join(' L')} L${bottom.join(' L')} Z` : '');
      lower = upper;
    }
    const current = speciesSamples.at(-1);
    this.speciesChart.setAttribute('aria-label', `Species over ${ticks} ticks. Current: ${SPECIES.map((role, i) => `${role} ${current[i]}`).join(', ')}`);
  }

  draw() {
    this.renderField();
    const summary = census(this.world);
    this.recordPopulation(summary);
    this.renderStatus(summary);
    return summary;
  }

  renderField() {
    if (this.isCompactZoom()) {
      this.view.style.display = 'none';
      this.compactCanvas.style.display = 'block';
      return this.renderCompactField();
    }
    this.view.style.display = '';
    if (this.compactCanvas) this.compactCanvas.style.display = 'none';
    const { cols, rows, entities, trails, flash } = this.world;
    const ch = Array(cols * rows).fill('·');
    const wrap = this.opts?.boundary === 'torus';
    const stars = entities.filter((e) => !e.dead && !e.g && e.mass >= P.STAR)
      .map((star) => {
        const power = starPower(star);
        return { x: star.x, y: star.y, power, reach: P.LIGHT_R * Math.sqrt(power) };
      });
    const lightAt = (x, y) => {
      let strength = 0;
      for (const star of stars) {
        let dx = x - star.x;
        let dy = y - star.y;
        if (wrap && Math.abs(dx) > cols / 2) dx -= Math.sign(dx) * cols;
        if (wrap && Math.abs(dy) > rows * ROW / 2) dy -= Math.sign(dy) * rows * ROW;
        if (Math.abs(dx) >= star.reach || Math.abs(dy) >= star.reach) continue;
        const distance = Math.hypot(dx, dy);
        if (distance < star.reach) strength += star.power * (1 - distance / star.reach) ** 1.5;
      }
      return strength;
    };
    const glowAt = (base, x, y) => {
      if (!stars.length) return 0;
      const level = Math.round(Math.min(1, lightAt(x, y) / 0.65) * LIGHT_LEVELS);
      return Math.round(level * (base === 'e' ? 100 : 44) / LIGHT_LEVELS);
    };
    const inkByCell = Array(cols * rows).fill('e');
    const glowByCell = new Uint8Array(cols * rows);
    if (stars.length) {
      const lightByCell = new Float64Array(cols * rows);
      for (const star of stars) {
        const xs = [];
        const ys = [];
        for (let x = 0; x < cols; x++) {
          let dx = x + 0.5 - star.x;
          if (wrap && Math.abs(dx) > cols / 2) dx -= Math.sign(dx) * cols;
          if (Math.abs(dx) < star.reach) xs.push([x, dx]);
        }
        for (let y = 0; y < rows; y++) {
          let dy = (y + 0.5) * ROW - star.y;
          if (wrap && Math.abs(dy) > rows * ROW / 2) dy -= Math.sign(dy) * rows * ROW;
          if (Math.abs(dy) < star.reach) ys.push([y, dy]);
        }
        for (const [y, dy] of ys) {
          for (const [x, dx] of xs) {
            const distance = Math.hypot(dx, dy);
            if (distance < star.reach) lightByCell[y * cols + x] += star.power * (1 - distance / star.reach) ** 1.5;
          }
        }
      }
      for (let i = 0; i < glowByCell.length; i++) {
        const level = Math.round(Math.min(1, lightByCell[i] / 0.65) * LIGHT_LEVELS);
        glowByCell[i] = Math.round(level * 100 / LIGHT_LEVELS);
      }
    }
    const pr = new Uint8Array(cols * rows);
    const put = (x, y, c, ink, glow, p) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      const i = y * cols + x;
      if (p < pr[i]) return;
      pr[i] = p;
      ch[i] = c;
      inkByCell[i] = ink;
      glowByCell[i] = glow;
    };

    for (const e of entities) {
      const x = Math.floor(e.x);
      const y = Math.floor(e.y / ROW);
      const c = glyph(e);
      if (c === GLYPHS[ROLE.STAR]) {
        const starColor = e.mass < 20 ? 's-dim' : e.mass >= 50 ? 's-bright' : 's';
        put(x, y, c, starColor, 0, 4);
      } else {
        const base = e.spore ? `${CLS[c]} infected` : CLS[c];
        put(x, y, movingGlyph(e, c), base, glowAt(base, e.x, e.y), e.g ? 3 : c === GLYPHS[ROLE.ROCK] ? 2 : 1);
      }
    }
    for (let i = 0; i < trails.length; i++) {
      if (pr[i]) continue;
      if (flash[i] > 0.1) {
        ch[i] = SHADE[Math.min(2, Math.floor(flash[i] * 3))];
        inkByCell[i] = 'x';
        glowByCell[i] = 0;
      } else if (trails[i] > 0.08) {
        inkByCell[i] = 't';
        glowByCell[i] = 0;
      }
    }
    this.paintField(cols, rows, ch, inkByCell, glowByCell);
    return { glyphs: ch, ink: inkByCell, glow: glowByCell };
  }

  renderCompactField() {
    const canvas = this.compactCanvas;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const width = Math.max(1, this.fieldScroller.clientWidth);
    const height = Math.max(1, this.fieldScroller.clientHeight);
    const scale = Math.min(globalThis.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.globalAlpha = 1;
    const style = globalThis.getComputedStyle?.(this);
    const color = (name, fallback) => style?.getPropertyValue?.(name).trim() || fallback;
    context.fillStyle = color('--bg', '#000');
    context.fillRect(0, 0, width, height);

    const { cols, rows, entities, trails, flash } = this.world;
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    const lightColor = color('--light', '#fff5cc');
    const wrap = this.opts?.boundary === 'torus';
    for (const star of entities) {
      if (star.g || star.mass < P.STAR) continue;
      const centerX = star.x * cellWidth;
      const centerY = star.y / ROW * cellHeight;
      const radius = P.LIGHT_R * Math.sqrt(starPower(star)) * Math.max(cellWidth, cellHeight / ROW);
      const centersX = [centerX];
      const centersY = [centerY];
      if (wrap && centerX < radius) centersX.push(centerX + width);
      if (wrap && centerX > width - radius) centersX.push(centerX - width);
      if (wrap && centerY < radius) centersY.push(centerY + height);
      if (wrap && centerY > height - radius) centersY.push(centerY - height);
      for (const x of centersX) {
        for (const y of centersY) {
          const glow = context.createRadialGradient(x, y, 0, x, y, radius);
          glow.addColorStop(0, lightColor);
          glow.addColorStop(1, 'transparent');
          context.globalAlpha = 0.18;
          context.fillStyle = glow;
          context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      }
    }
    const trailColor = color('--trail', '#5d7391');
    const flashColor = color('--flash', '#f2c46e');
    const markWidth = Math.max(0.7, cellWidth * 0.35);
    const markHeight = Math.max(0.7, cellHeight * 0.35);
    for (let i = 0; i < trails.length; i++) {
      const intensity = flash[i] > 0.1 ? flash[i] : trails[i] > 0.08 ? trails[i] : 0;
      if (!intensity) continue;
      context.fillStyle = flash[i] > 0.1 ? flashColor : trailColor;
      context.globalAlpha = Math.min(0.7, Math.max(0.1, intensity * 0.55));
      context.fillRect(((i % cols) + 0.5) * cellWidth - markWidth / 2, (Math.floor(i / cols) + 0.5) * cellHeight - markHeight / 2, markWidth, markHeight);
    }
    context.globalAlpha = 1;
    const colors = {
      [GLYPHS[ROLE.FOOD]]: color('--food', '#8b8f94'),
      [GLYPHS[ROLE.ROCK]]: color('--rock', '#929ba4'),
      [GLYPHS[ROLE.STAR]]: color('--star', '#fff0a8'),
      [GLYPHS[ROLE.CELL]]: color('--cell', '#8d9295'),
      [GLYPHS[ROLE.FORAGER]]: color('--forager', '#f3a65d'),
      [GLYPHS[ROLE.HUNTER]]: color('--hunter', '#ef6b68'),
      [GLYPHS[ROLE.HELIOTROPE]]: color('--heliotrope', '#67ce7d'),
      [GLYPHS[ROLE.PARASITE]]: color('--parasite', '#68bbd1'),
    };
    const drawText = cellWidth >= 7 && cellHeight >= 9;
    if (drawText) {
      context.font = `${Math.min(cellHeight * 0.9, cellWidth * 1.5)}px ui-monospace, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
    }
    for (const entity of entities) {
      const x = Math.floor(entity.x);
      const y = Math.floor(entity.y / ROW);
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const mark = glyph(entity);
      context.fillStyle = entity.spore ? color('--infection', '#68bbd1') : colors[mark] || color('--fg', '#b8c0c2');
      const centerX = (x + 0.5) * cellWidth;
      const centerY = (y + 0.5) * cellHeight;
      if (drawText) context.fillText(MOBILE_GLYPHS[movingGlyph(entity, mark)] ?? mark, centerX, centerY);
      else {
        context.beginPath();
        context.arc(centerX, centerY, Math.max(0.7, Math.min(cellWidth, cellHeight) * (mark === GLYPHS[ROLE.STAR] ? 0.5 : 0.32)), 0, Math.PI * 2);
        context.fill();
      }
    }
    return { compact: true, cols, rows };
  }

  paintField(cols, rows, glyphs, ink, glow) {
    const count = cols * rows;
    const mobile = !!globalThis.matchMedia?.('(max-width: 600px)').matches;
    const rebuild = this.fieldCols !== cols || this.fieldCells?.length !== count;
    if (rebuild) {
      this.view.style.setProperty('--cols', cols);
      this.view.style.setProperty('--rows', rows);
      this.view.innerHTML = '<span></span>'.repeat(count);
      this.fieldCells = Array.from(this.view.children);
      this.fieldCols = cols;
      this.fieldRows = rows;
      this.fieldClasses = new Array(count);
      this.fieldMarks = new Array(count);
      this.updateFieldLayout();
    }
    for (let i = 0; i < count; i++) {
      const className = glow[i] ? `${ink[i]} lit` : ink[i];
      const mark = mobile ? MOBILE_GLYPHS[glyphs[i]] ?? glyphs[i] : glyphs[i];
      const classChanged = this.fieldClasses[i] !== className;
      const markChanged = this.fieldMarks[i] !== mark;
      const glowChanged = rebuild || glow[i] !== this.lastGlow?.[i];
      if (!classChanged && !markChanged && !glowChanged) continue;
      const cell = this.fieldCells[i];
      if (classChanged) {
        if (cell.className !== className) cell.className = className;
        this.fieldClasses[i] = className;
      }
      if (markChanged) {
        if (cell.textContent !== mark) cell.textContent = mark;
        this.fieldMarks[i] = mark;
      }
      if (glowChanged) cell.style.setProperty('--glow', `${glow[i]}%`);
    }
    this.fieldMobile = mobile;
    this.lastGlow = glow;
  }

  recordPopulation(s) {
    this.history.push(s.pop);
    this.speciesHistory.push(SPECIES.map((role) => s.counts[GLYPHS[role]] || 0));
    if (this.history.length > 721) {
      this.history.shift();
      this.speciesHistory.shift();
    }
    const stride = Math.max(1, Math.round(this.opts.speed / 5));
    if (!this.raf || s.tick % stride === 0) this.updateSparkline();
  }

  renderStatus(s) {
    for (const item of this.shadowRoot.querySelectorAll('.legend [data-g]')) {
      item.querySelector('small').textContent = s.counts[item.dataset.g] || 0;
    }
    const { births, deaths, meals, bites, infections, impacts, shatters, starBirths, starMergers, novae, ejecta } = s.events;
    this.status.textContent = [
      `Living ${s.pop}     Tick ${s.tick}     Gen ${s.gen}`,
      `Avg energy ${s.avgEnergy.toFixed(1)}     Avg age ${s.avgAge.toFixed(0)}`,
    ].join('\n');
    this.events.textContent = [
      `Cells      born ${births}  died ${deaths}`,
      `Feeding    meals ${meals}  bites ${bites}`,
      `Parasites  infections ${infections}`,
      `Matter     impacts ${impacts}  chips ${shatters}`,
      `Stars      born ${starBirths}  merged ${starMergers}`,
      `           bursts ${novae}  food shed ${ejecta}`,
    ].join('\n');
  }
}
