import css from './style.css';
import { createWorld, tick, census, glyph, P, ROW, PRESETS } from './sim.js';
import { ROLE, GLYPHS } from './sim/constants.js';
import { starPower } from './sim/entities.js';

const THEMES = ['ansi', 'green', 'amber', 'colorblind'];
const SHADE = '░▒▓';
const MIN_FACING_SPEED = 0.05;
const LIGHT_LEVELS = 32;
const FACING = {
  [GLYPHS[ROLE.FORAGER]]: { up: '↑', right: '→', down: '↓', left: '←' },
  [GLYPHS[ROLE.HUNTER]]: { up: '▲', right: '►', down: '▼', left: '◄' },
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
  return `<span data-g="${mark}"><b class="${CLS[mark]}">${mark}</b> ${role} <small>0</small></span>`;
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

export class Cosmordial extends (globalThis.HTMLElement ?? class {}) {
  static observedAttributes = ['cols', 'rows', 'preset', 'theme', 'speed', 'gravity', 'mutation', 'boundary', 'autoplay', 'trail-length'];

  constructor() {
    super();
    const hatchPrefix = `cosmordial-hatch-${++hatchSequence}`;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>
<div class="layout">
<div class="controls">
<nav>
  <button data-k=" "></button>
  <button data-k="s">[s] step</button>
  <button data-k="r">[r] reset</button>
  <span class="nav-break" aria-hidden="true"></span>
  ${PRESETS.map((p, i) => `<button data-k="${i + 1}" data-p="${p}">[${i + 1}] ${p}</button>`).join('')}
  <span class="nav-break" aria-hidden="true"></span>
  <button data-k="b"></button>
  <button data-k="t"></button>
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
<pre class="u"></pre>
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
  <div class="species-key">${SPECIES.map((role) => `<span><b class="${CLS[GLYPHS[role]]}" aria-hidden="true">■</b><i aria-hidden="true">${HATCH_MARK[role]}</i> ${role}</span>`).join('')}</div>
  <div class="status-heading">EVENTS SINCE RESET</div>
  <pre class="events"></pre>
</div>
</div>`;
    this.view = root.querySelector('.u');
    this.status = root.querySelector('.stats');
    this.events = root.querySelector('.events');
    this.pophead = root.querySelector('.pophead');
    this.sparkline = root.querySelector('.sparkline');
    this.sparklineLine = root.querySelector('.sparkline polyline');
    this.speciesChart = root.querySelector('.species-chart');
    this.speciesPaths = SPECIES.map((role) => root.querySelector(`.species-${role}`));
    root.addEventListener('mousedown', (e) => e.target.dataset.k && e.preventDefault());
    root.addEventListener('click', (e) => e.target.dataset.k && this.key(e.target.dataset.k));
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
      if (e.composedPath()[0].matches?.('button, input, select, summary')) return;
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
    if (!this.world) this.reset();
    if (this.getAttribute('autoplay') !== 'false') this.play();
    else this.sync();
    if (this.hasAttribute('autofocus')) this.focus();
  }

  disconnectedCallback() {
    this.pause();
  }

  attributeChangedCallback(name) {
    if (!this.world) return;
    if (['cols', 'rows', 'preset'].includes(name)) this.reset();
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
      if (name === 'speed') this.updateSparkline();
    }
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
    this.world = createWorld(this.getAttribute('preset') || 'orbit', num(this, 'cols', 80), num(this, 'rows', 30), this.opts.G, this.opts.boundary);
    this.history = [];
    this.speciesHistory = [];
    this.draw();
    this.sync();
  }

  key(k) {
    const preset = PRESETS[k - 1];
    if (k === ' ') this.raf ? this.pause() : this.play();
    else if (k === 's') this.step();
    else if (k === 'r') this.reset();
    else if (preset) this.setAttribute('preset', preset);
    else if (k === 'b') this.setAttribute('boundary', this.opts.boundary === 'torus' ? 'box' : 'torus');
    else if (k === 't') this.setAttribute('theme', THEMES[(THEMES.indexOf(this.getAttribute('theme')) + 1) % THEMES.length]);
    else return false;
    return true;
  }

  sync() {
    const root = this.shadowRoot;
    root.querySelector('[data-k=" "]').textContent = `[spc] ${this.raf ? 'pause' : 'run'}`;
    root.querySelector('[data-k="b"]').textContent = `[b] ${this.opts.boundary}`;
    root.querySelector('[data-k="t"]').textContent = `[t] ${this.getAttribute('theme')}`;
    const preset = this.getAttribute('preset') || 'orbit';
    for (const b of root.querySelectorAll('[data-p]')) b.classList.toggle('on', b.dataset.p === preset);
    for (const i of root.querySelectorAll('input')) {
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
    const ink = (base, x, y) => {
      const level = Math.round(Math.min(1, lightAt(x, y) / 0.65) * LIGHT_LEVELS);
      if (!level) return `class="${base}"`;
      const mix = Math.round(level * (base === 'e' ? 100 : 44) / LIGHT_LEVELS);
      return `class="${base} lit" style="--glow:${mix}%"`;
    };
    const inkByCell = Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) inkByCell[y * cols + x] = ink('e', x + 0.5, (y + 0.5) * ROW);
    }
    const pr = new Uint8Array(cols * rows);
    const put = (x, y, c, k, p) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      const i = y * cols + x;
      if (p < pr[i]) return;
      pr[i] = p;
      ch[i] = c;
      inkByCell[i] = k;
    };

    for (const e of entities) {
      const x = Math.floor(e.x);
      const y = Math.floor(e.y / ROW);
      const c = glyph(e);
      if (c === GLYPHS[ROLE.STAR]) {
        const starColor = e.mass < 20 ? 's-dim' : e.mass >= 50 ? 's-bright' : 's';
        put(x, y, c, `class="${starColor}"`, 4);
      } else put(x, y, movingGlyph(e, c), ink(e.spore ? `${CLS[c]} infected` : CLS[c], e.x, e.y), e.g ? 3 : c === GLYPHS[ROLE.ROCK] ? 2 : 1);
    }
    for (let i = 0; i < trails.length; i++) {
      if (pr[i]) continue;
      if (flash[i] > 0.1) {
        ch[i] = SHADE[Math.min(2, Math.floor(flash[i] * 3))];
        inkByCell[i] = 'class="x"';
      } else if (trails[i] > 0.08) inkByCell[i] = 'class="t"';
    }

    const bar = '─'.repeat(cols);
    let html = `<span class="frame">┌${bar}┐</span>\n`;
    for (let y = 0; y < rows; y++) {
      let cur = inkByCell[y * cols];
      let run = '';
      html += '<span class="frame">│</span>';
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (inkByCell[i] !== cur) {
          html += `<span ${cur}>${run}</span>`;
          cur = inkByCell[i];
          run = '';
        }
        run += ch[i];
      }
      html += `<span ${cur}>${run}</span><span class="frame">│</span>\n`;
    }
    this.view.innerHTML = html + `<span class="frame">└${bar}┘</span>`;
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
