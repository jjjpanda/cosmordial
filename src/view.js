import css from './style.css';
import { createWorld, tick, census, glyph, P, ROW, PRESETS } from './sim.js';

const THEMES = ['ansi', 'green', 'amber'];
const SHADE = '░▒▓';
const ARMS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CLS = { '·': 'e', '∙': 'm', '°': 'r', 'Θ': 's', 'α': 'a', 'Ω': 'h', 'φ': 'p', 'Ξ': 'b', 'σ': 'f' };
const LEGEND = [
  ['∙', 'food'], ['°', 'rock'], ['Θ', 'star'], ['α', 'cell'],
  ['Ω', 'hunter'], ['φ', 'heliotrope'], ['Ξ', 'parasite'], ['σ', 'forager'],
];

const num = (el, name, def) => {
  const value = Number(el.getAttribute(name));
  return el.hasAttribute(name) && Number.isFinite(value) ? value : def;
};

export class Cosmordial extends (globalThis.HTMLElement ?? class {}) {
  static observedAttributes = ['cols', 'rows', 'preset', 'theme', 'speed', 'gravity', 'mutation', 'boundary', 'autoplay'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>
<div class="layout">
<div class="controls">
<nav>
  <button data-k=" "></button>
  <button data-k="s">[s] step</button>
  <button data-k="r">[r] reset</button>
  ${PRESETS.map((p, i) => `<button data-k="${i + 1}" data-p="${p}">[${i + 1}] ${p}</button>`).join('')}
  <span class="nav-break" aria-hidden="true"></span>
  <button data-k="b"></button>
  <button data-k="t"></button>
</nav>
<nav>
  <label>speed <input name="speed" type="range" min="1" max="60"><output></output></label>
  <label>gravity <input name="G" type="range" min="0" max="0.5" step="0.02"><output></output></label>
  <label>mutation <input name="mutation" type="range" min="0" max="0.5" step="0.01"><output></output></label>
</nav>
<section class="legend" aria-label="Legend">
  <strong>KEY · CURRENT COUNT</strong>
  ${LEGEND.map(([mark, label]) => `<span data-g="${mark}"><b class="${CLS[mark]}">${mark}</b> ${label} <small>0</small></span>`).join('')}
</section>
</div>
<pre class="u"></pre>
<div class="status">
  <div class="pophead"></div>
  <svg class="sparkline" viewBox="0 0 120 30" preserveAspectRatio="none" role="img" aria-label="Population history"><polyline points=""></polyline></svg>
  <pre class="stats"></pre>
</div>
</div>`;
    this.view = root.querySelector('.u');
    this.status = root.querySelector('.stats');
    this.pophead = root.querySelector('.pophead');
    this.sparkline = root.querySelector('.sparkline');
    this.sparklineLine = root.querySelector('.sparkline polyline');
    root.addEventListener('mousedown', (e) => e.target.dataset.k && e.preventDefault());
    root.addEventListener('click', (e) => e.target.dataset.k && this.key(e.target.dataset.k));
    root.addEventListener('input', (e) => {
      this.opts[e.target.name] = Number(e.target.value);
      this.sync();
      if (e.target.name === 'speed') this.updateSparkline();
    });
    this.addEventListener('keydown', (e) => this.key(e.key.toLowerCase()) && e.preventDefault());
  }

  connectedCallback() {
    if (!this.hasAttribute('theme')) this.setAttribute('theme', 'ansi');
    this.tabIndex = 0;
    this.opts ??= {
      speed: num(this, 'speed', 25),
      G: num(this, 'gravity', P.G),
      mutation: num(this, 'mutation', P.MUTATION),
      boundary: this.getAttribute('boundary') || 'box',
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
      let steps = 0;
      while (carry >= interval && steps < 4) {
        this.step();
        carry -= interval;
        steps++;
      }
      if (steps === 4) carry = 0;
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
    this.world = createWorld(this.getAttribute('preset') || 'orbit', num(this, 'cols', 80), num(this, 'rows', 30), this.opts.G);
    this.history = [];
    this.draw();
    this.sync();
  }

  key(k) {
    const preset = PRESETS[k - 1];
    if (k === ' ') this.raf ? this.pause() : this.play();
    else if (k === 's') this.step();
    else if (k === 'r') this.reset();
    else if (preset) this.setAttribute('preset', preset);
    else if (k === 'b') {
      this.opts.boundary = this.opts.boundary === 'torus' ? 'box' : 'torus';
      this.sync();
    } else if (k === 't') this.setAttribute('theme', THEMES[(THEMES.indexOf(this.getAttribute('theme')) + 1) % THEMES.length]);
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
    const samples = [];
    for (let i = this.history.length - 1; i >= 0 && samples.length < 60; i -= stride) samples.push(this.history[i]);
    samples.reverse();
    const low = Math.min(...samples);
    const high = Math.max(...samples);
    const points = samples.length === 1
      ? '0,15 120,15'
      : samples.map((v, i) => `${(120 * i / (samples.length - 1)).toFixed(1)},${high === low ? 15 : (28 - 26 * (v - low) / (high - low)).toFixed(1)}`).join(' ');
    const ticks = (samples.length - 1) * stride;
    this.sparklineLine.setAttribute('points', points);
    this.pophead.textContent = `POPULATION · ${ticks} TICKS · RANGE ${low}–${high}`;
    this.sparkline.setAttribute('aria-label', `Living cells over ${ticks} ticks: ${samples[0]} to ${samples.at(-1)}, range ${low} to ${high}`);
  }

  draw() {
    const { cols, rows, entities, trails, flash } = this.world;
    const ch = Array(cols * rows).fill('·');
    const cls = Array(cols * rows).fill('e');
    const pr = new Uint8Array(cols * rows);
    const put = (x, y, c, k, p) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      const i = y * cols + x;
      if (p < pr[i]) return;
      pr[i] = p;
      ch[i] = c;
      cls[i] = k;
    };

    for (const e of entities) {
      const x = Math.floor(e.x);
      const y = Math.floor(e.y / ROW);
      const c = glyph(e);
      if (c === 'Θ') {
        const starColor = e.mass < 20 ? 's-dim' : e.mass >= 50 ? 's-bright' : 's';
        put(x, y, 'Θ', starColor, 4);
        for (const [dx, dy] of ARMS) put(x + dx, y + dy, '○', starColor, 4);
      } else put(x, y, c, e.spore ? `${CLS[c]} infected` : CLS[c], e.g ? 3 : c === '°' ? 2 : 1);
    }
    for (let i = 0; i < trails.length; i++) {
      if (pr[i]) continue;
      if (flash[i] > 0.1) {
        ch[i] = SHADE[Math.min(2, Math.floor(flash[i] * 3))];
        cls[i] = 'x';
      } else if (trails[i] > 0.08) cls[i] = 't';
    }

    const bar = '─'.repeat(cols);
    let html = `<span class="e">┌${bar}┐</span>\n`;
    for (let y = 0; y < rows; y++) {
      let cur = cls[y * cols];
      let run = '';
      html += '<span class="e">│</span>';
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (cls[i] !== cur) {
          html += `<span class="${cur}">${run}</span>`;
          cur = cls[i];
          run = '';
        }
        run += ch[i];
      }
      html += `<span class="${cur}">${run}</span><span class="e">│</span>\n`;
    }
    this.view.innerHTML = html + `<span class="e">└${bar}┘</span>`;

    const s = census(this.world);
    this.history.push(s.pop);
    if (this.history.length > 721) this.history.shift();
    const stride = Math.max(1, Math.round(this.opts.speed / 5));
    if (!this.raf || s.tick % stride === 0) this.updateSparkline();
    for (const item of this.shadowRoot.querySelectorAll('.legend [data-g]')) {
      item.querySelector('small').textContent = s.counts[item.dataset.g] || 0;
    }
    const { births, deaths, meals, bites, infections, impacts, shatters, starBirths, starMergers, novae, ejecta } = s.events;
    this.status.textContent = [
      `TICK ${s.tick}  CELLS ${s.pop}  MAX GEN ${s.gen}`,
      `AVG ENERGY ${s.avgEnergy.toFixed(1)}  AGE ${s.avgAge.toFixed(0)} ticks`,
      '',
      'TOTAL SINCE RESET',
      `CELLS born ${births}  died ${deaths}`,
      `FEED meals ${meals}  bites ${bites}`,
      `PARASITE infections ${infections}`,
      `MATTER impacts ${impacts}  chips ${shatters}`,
      `STARS born ${starBirths}  merged ${starMergers}`,
      `      novae ${novae}  food shed ${ejecta}`,
    ].join('\n');
    return s;
  }
}
