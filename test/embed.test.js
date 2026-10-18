import assert from 'node:assert/strict';
import test from 'node:test';
import * as esbuild from 'esbuild';
import { embedAttributes } from '../src/embed-options.js';

test('the hosted entry applies URL options before connecting the component', async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: ['src/embed.js'], bundle: true, format: 'iife', write: false,
    loader: { '.css': 'text' },
  });
  const boot = new Function('document', 'location', outputFiles[0].text);
  for (const transparent of [true, false]) {
    const attributes = {};
    let appended = false;
    const component = {
      setAttribute(name, value) {
        assert.equal(appended, false, 'all options must be set before connectedCallback');
        attributes[name] = value;
      },
    };
    const document = {
      documentElement: { style: {} },
      createElement(tag) { assert.equal(tag, 'cosmordial-universe'); return component; },
      body: {
        append(element) {
          assert.equal(element, component);
          assert.equal(attributes.preset, 'binary');
          assert.equal(attributes.autoplay, 'false');
          assert.equal(attributes.embed, '');
          appended = true;
        },
      },
    };
    boot(document, { search: `?preset=binary&autoplay=false&transparent=${transparent}&onclick=bad` });
    assert.equal(appended, true);
    assert.equal('onclick' in attributes, false);
    assert.equal('autofocus' in attributes, false);
    assert.equal(document.documentElement.style.background, transparent ? 'transparent' : '#000');
  }
});

test('embed defaults preserve component defaults without stealing focus', () => {
  assert.deepEqual(embedAttributes(''), { embed: '' });
});

test('embed URLs configure every supported simulation setting', () => {
  assert.deepEqual(embedAttributes('?preset=binary&theme=amber&boundary=torus&width=800&height=450&cols=90&rows=35&speed=12&gravity=0.2&mutation=0.1&trail-length=0&autoplay=false&transparent=true&autofocus'), {
    embed: '', preset: 'binary', theme: 'amber', boundary: 'torus',
    width: '800', height: '450', cols: '90', rows: '35', speed: '12',
    gravity: '0.2', mutation: '0.1', 'trail-length': '0',
    transparent: '', autofocus: '', autoplay: 'false',
  });
});

test('URL booleans distinguish presence and false and first duplicate wins', () => {
  assert.deepEqual(embedAttributes('?transparent=false&autofocus=false&autoplay=true'), { embed: '', autoplay: 'true' });
  assert.deepEqual(embedAttributes('?transparent&autofocus=true&autoplay=0'), { embed: '', transparent: '', autofocus: '' });
  assert.deepEqual(embedAttributes('?preset=soup&preset=orbit&speed=12&speed=30'), { embed: '', preset: 'soup', speed: '12' });
});

test('unrecognized attributes and invalid values cannot change the embed', () => {
  assert.deepEqual(embedAttributes('?onload=alert(1)&style=color:red&embed=false&constructor=bad&preset=unknown&theme=dark&boundary=other&autoplay=no&transparent=no&autofocus=no'), { embed: '' });
});

test('numeric URL settings reject non-finite, fractional grid and out-of-range allocations', () => {
  const invalid = {
    width: ['', '79', '4097', '80.5', 'Infinity', '0x100', '100px'],
    height: ['-1', '2161', 'NaN'],
    cols: ['0', '401', '1.5', '1e1000'],
    rows: ['0', '201', '2.5'],
    speed: ['0', '61', 'NaN'],
    gravity: ['-0.1', '0.51'],
    mutation: ['-0.1', '0.51'],
    'trail-length': ['-1', '21', '1.5'],
  };
  for (const [name, values] of Object.entries(invalid)) {
    for (const value of values) {
      assert.deepEqual(embedAttributes(new URLSearchParams({ [name]: value })), { embed: '' }, `${name}=${value}`);
    }
  }
  assert.deepEqual(embedAttributes('?width=4096&height=2160&cols=400&rows=200&speed=60&gravity=0&mutation=0.5&trail-length=20'), {
    embed: '', width: '4096', height: '2160', cols: '400', rows: '200',
    speed: '60', gravity: '0', mutation: '0.5', 'trail-length': '20',
  });
});
