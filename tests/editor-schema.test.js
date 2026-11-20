const test = require('node:test');
const assert = require('node:assert/strict');
const BH = require('../src/config.js');
require('../src/editor.js');

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (path, v) => { const o = {}; const ks = path.split('.'); let c = o; ks.slice(0, -1).forEach((k) => (c = c[k] = {})); c[ks.at(-1)] = v; return o; };

test('every control points at a real setting', () => {
  for (const c of BH.CONTROLS) {
    if (c.type === 'button') continue;
    assert.notEqual(get(BH.DEFAULTS, c.key), undefined, c.key);
  }
});

test('slider ranges match the config ranges', () => {
  for (const c of BH.CONTROLS.filter((c) => c.type === 'slider')) {
    assert.equal(get(BH.normalize(setPath(c.key, c.min - 1000)), c.key), c.min, c.key + ' min');
    assert.equal(get(BH.normalize(setPath(c.key, c.max + 1000)), c.key), c.max, c.key + ' max');
  }
});

test('labels use plain language', () => {
  const banned = /isco|geodesic|schwarzschild|kerr|spin parameter/i;
  for (const c of BH.CONTROLS) assert.doesNotMatch(c.label, banned, c.label);
});

test('select options are all valid values', () => {
  for (const c of BH.CONTROLS.filter((c) => c.type === 'select')) {
    for (const o of c.options) assert.equal(get(BH.normalize(setPath(c.key, o[0])), c.key), o[0], c.key + '=' + o[0]);
  }
});
