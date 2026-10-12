import { P, KIN, ROLES } from './constants.js';
import { rand, jitter } from './space.js';

export const starterGenome = () => [rand(0.15, 0.75), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.2, 0.4), rand(0.2, 0.7)];
export const body = (x, y, vx, vy, mass) => ({ x, y, vx, vy, mass });
export const starPower = (s) => Math.sqrt(s.mass / 35);
export const cell = (x, y, vx, vy, g, energy = P.START_E, gen = 0) => {
  const e = { x, y, vx, vy, g, energy, gen, age: 0, lastBirth: 0 };
  const role = glyph(e);
  const life = role === 'Ω' ? P.HUNTER_LIFE : role === 'σ' ? P.FORAGER_LIFE : role === 'φ' ? P.HELIOTROPE_LIFE : 1;
  e.lifespan = Math.round(P.LIFESPAN * life * rand(0.75, 1.35));
  return e;
};
export const eventCounts = () => ({
  births: 0, deaths: 0, meals: 0, bites: 0, infections: 0,
  impacts: 0, shatters: 0, ejecta: 0,
  starBirths: 0, starMergers: 0, novae: 0,
});

export function glyph(e) {
  if (!e.g) return e.mass >= P.STAR ? 'Θ' : e.mass >= P.ROCK ? '°' : '∙';
  let best = 'α';
  let max = 0.5;
  for (const [i, c] of ROLES) {
    if (e.g[i] > max) {
      max = e.g[i];
      best = c;
    }
  }
  return best;
}

export function kin(a, b) {
  let s = 0;
  for (let i = 0; i < a.g.length; i++) s += (a.g[i] - b.g[i]) ** 2;
  const t = (a.g[KIN] + b.g[KIN]) / 2;
  return s < t * t;
}

export function canBite(a, b) {
  return !kin(a, b) && !(glyph(a) === 'σ' && glyph(b) === 'σ');
}

export const isParasite = (e) => glyph(e) === 'Ξ';
export const isHost = (e) => {
  const role = glyph(e);
  return role === 'α' || role === 'σ' || role === 'Ω';
};
export const isHuntTarget = (e) => {
  const role = glyph(e);
  return role === 'α' || role === 'σ';
};

export function mutate(g, rate) {
  return g.map((v) => (Math.random() < rate ? Math.min(1, Math.max(0, v + jitter(0.35))) : v));
}

