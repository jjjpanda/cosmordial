import { Cosmordial } from './view.js';

export * from './sim.js';
export { Cosmordial };

if (globalThis.customElements && !customElements.get('cosmordial-universe')) {
  customElements.define('cosmordial-universe', Cosmordial);
}
