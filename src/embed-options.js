const enums = {
  preset: ['orbit', 'binary', 'soup'],
  theme: ['ansi', 'green', 'amber', 'colorblind'],
  boundary: ['box', 'torus'],
};

// Keep pixel dimensions consistent with the component, and simulation settings
// within its slider ranges. Bound grid sizes to avoid unbounded URL allocations.
const numbers = {
  width: [80, 4096, true],
  height: [80, 2160, true],
  cols: [1, 400, true],
  rows: [1, 200, true],
  speed: [1, 60, false],
  gravity: [0, 0.5, false],
  mutation: [0, 0.5, false],
  'trail-length': [0, 20, true],
};

/** Return only supported, valid component attributes from an embed URL. */
export function embedAttributes(search) {
  const params = new URLSearchParams(search);
  const attributes = { embed: '' };
  for (const [name, choices] of Object.entries(enums)) {
    const value = params.get(name);
    if (choices.includes(value)) attributes[name] = value;
  }
  for (const [name, [min, max, integer]] of Object.entries(numbers)) {
    const raw = params.get(name);
    if (raw === null || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) {
      attributes[name] = String(value);
    }
  }
  for (const name of ['transparent', 'autofocus']) {
    if (params.get(name) === '' || params.get(name) === 'true') attributes[name] = '';
  }
  if (['true', 'false'].includes(params.get('autoplay'))) attributes.autoplay = params.get('autoplay');
  return attributes;
}
