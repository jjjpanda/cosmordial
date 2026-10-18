import './index.js';
import { embedAttributes } from './embed-options.js';

const attributes = embedAttributes(location.search);
const universe = document.createElement('cosmordial-universe');
for (const [name, value] of Object.entries(attributes)) universe.setAttribute(name, value);
document.documentElement.style.background = 'transparent' in attributes ? 'transparent' : '#000';
// Configure the detached component before connecting it, so the first world and
// autoplay state already use the URL settings.
document.body.append(universe);
