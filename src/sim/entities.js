import { P, KIN, ROLE, ROLES, GLYPHS } from './constants.js';
import { rand, jitter } from './space.js';

export const starterGenome = () => [rand(0.15, 0.75), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.4, 0.49), rand(0.2, 0.4), rand(0.2, 0.7)];
export const body = (x, y, vx, vy, mass) => ({ x, y, vx, vy, mass });
export const starPower = (s) => Math.sqrt(s.mass / 35);
export const cell = (x, y, vx, vy, g, energy = P.START_E, gen = 0) => {
  const e = { x, y, vx, vy, g, energy, gen, age: 0, lastBirth: 0 };
  const role = roleOf(e);
  const life = role === ROLE.HUNTER ? P.HUNTER_LIFE : role === ROLE.FORAGER ? P.FORAGER_LIFE : role === ROLE.HELIOTROPE ? P.HELIOTROPE_LIFE : 1;
  e.lifespan = Math.round(P.LIFESPAN * life * rand(0.75, 1.35));
  return e;
};
export const eventCounts = () => ({
  births: 0, deaths: 0, meals: 0, bites: 0, infections: 0,
  impacts: 0, shatters: 0, ejecta: 0,
  starBirths: 0, starMergers: 0, novae: 0,
});

export function roleOf(e) {
  if (!e.g) return e.mass >= P.STAR ? ROLE.STAR : e.mass >= P.ROCK ? ROLE.ROCK : ROLE.FOOD;
  let best = ROLE.CELL;
  let max = 0.5;
  for (const [i, role] of ROLES) {
    if (e.g[i] > max) {
      max = e.g[i];
      best = role;
    }
  }
  return best;
}

export function glyph(e) {
  return GLYPHS[roleOf(e)];
}

export function kin(a, b) {
  let s = 0;
  for (let i = 0; i < a.g.length; i++) s += (a.g[i] - b.g[i]) ** 2;
  const t = (a.g[KIN] + b.g[KIN]) / 2;
  return s < t * t;
}

export function canBite(a, b) {
  return !kin(a, b) && !(roleOf(a) === ROLE.FORAGER && roleOf(b) === ROLE.FORAGER);
}

export const isParasite = (e) => roleOf(e) === ROLE.PARASITE;
export const isHost = (e) => {
  const role = roleOf(e);
  return role === ROLE.CELL || role === ROLE.FORAGER || role === ROLE.HUNTER;
};
export const isHuntTarget = (e) => {
  const role = roleOf(e);
  return role === ROLE.CELL || role === ROLE.FORAGER;
};

export function mutate(g, rate) {
  return g.map((v) => (Math.random() < rate ? Math.min(1, Math.max(0, v + jitter(0.35))) : v));
}

