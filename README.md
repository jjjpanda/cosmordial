# Cosmordial

A text-based simulation of gravity, matter, and evolving cells, packaged as a web component.

![Binary preset](screenshots/binary.png)

![Soup preset](screenshots/soup.png)

## Matter

Matter merges into rocks, then stars. Stars emit light and shed matter; bursts return matter to the cycle.

## Life

Cells spend energy to move and reproduce. Mutations change their traits and roles.

| Cell | Behavior |
| --- | --- |
| Forager | Seeks food; flees hunters. |
| Heliotrope | Feeds on starlight; immune to infection. |
| Hunter | Chases and drains prey. |
| Parasite | Drains and infects hosts. |

## Embed

### Hosted iframe

Use the field-only `/embed/` page to keep the simulation out of your site's
JavaScript bundle. The iframe downloads Cosmordial separately when it loads.

```html
<iframe
  src="https://jjjpanda.github.io/cosmordial/embed/?preset=binary&amp;theme=amber&amp;speed=12&amp;autoplay=true"
  title="Cosmordial simulation"
  width="800"
  height="450"
  loading="lazy"
  style="border: 0"
></iframe>
```

`/embed` redirects to `/embed/` on GitHub Pages and the development server. If
hosting under a project path, keep that prefix (for example,
`/cosmordial/embed/`). The field fits the iframe's width and height without
clipping or scrollbars. Navigation, settings, legends, statistics, and field
buttons are hidden. Keyboard controls remain available when the field has focus;
the iframe does not take focus automatically.

Query parameters configure the component before the simulation starts:

| Parameter | Accepted values |
| --- | --- |
| `preset` | `orbit`, `binary`, `soup` |
| `theme` | `ansi`, `green`, `amber`, `colorblind` |
| `boundary` | `box`, `torus` |
| `width`, `height` | Integer field size: 80–4096 / 80–2160 pixels, capped by the iframe. Omit to fill the iframe. |
| `cols`, `rows` | Integer grid size: 1–400 columns / 1–200 rows. |
| `speed` | 1–60 ticks per second |
| `gravity`, `mutation` | 0–0.5 |
| `trail-length` | Integer from 0–20 |
| `autoplay` | `true` or `false` |
| `transparent`, `autofocus` | `true` or a bare parameter enables; `false` disables. |

Omitted or invalid parameters use the component defaults listed below. Unknown
parameters are ignored, including `embed`: this page always uses embed mode.
When a parameter is repeated, its first value is used. `transparent=true` clears
both the iframe page and component backgrounds. Match your surrounding colors to
the selected theme. Change the iframe's `src` to apply new settings; doing so
reloads the simulation.

### Web component

```sh
npm install ../cosmordial
```

```js
import 'cosmordial';
```

```html
<cosmordial-universe width="800" height="450" preset="binary" theme="amber"></cosmordial-universe>
```

The whole field must fit the available space. Requested dimensions shrink to fit the container; no overflow, scrolling, or clipped rows or columns are allowed.

## Options

Set options with HTML attributes or `setAttribute()`.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `width`, `height` | automatic | Requested field size in pixels, limited by available space. |
| `cols`, `rows` | 80 × 30; adapts on mobile | Simulation grid size. Changing either resets the world. |
| `preset` | `orbit` | `orbit`, `binary`, or `soup`. Changing it resets the world. |
| `theme` | `ansi` | `ansi`, `green`, `amber`, or `colorblind`. |
| `speed` | `25` | Ticks per second. |
| `gravity` | `0.1` | Gravity strength. |
| `mutation` | `0.25` | Mutation rate. |
| `trail-length` | `6` | Trail duration; `0` disables trails. |
| `boundary` | `box` | `box` or `torus` (wraparound). |
| `autoplay` | on | Set to `false` to start paused. |
| `transparent`, `autofocus` | absent | Add to enable a transparent background or initial focus. |
| `embed` | absent | Add to hide all interface panels and fit the field to the component's height. Give its container a definite height. |

## Controls

Use the buttons and sliders, or these keys when the component has focus:

| Key | Action |
| --- | --- |
| Space | Run / pause |
| S / R | Step / reset |
| 1–3 | Change preset |
| B / T | Change boundary / theme |
| + / − | Zoom in fullscreen |

Use the fullscreen button to enter or exit fullscreen. Zoom ranges from 20% to 200% and changes the simulation boundaries. Shrinking a box removes entities outside it; a torus keeps them. Below 40%, the field uses pixels instead of characters.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

`npm run benchmark` runs seeded simulation trials.
