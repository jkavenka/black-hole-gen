const test = require('node:test');
const assert = require('node:assert/strict');
const BH = require('../src/config.js');
require('../src/physics.js');
require('../src/shader.js');

const fs = (partial) => BH.buildFragmentShader(BH.features(BH.normalize(partial)));

test('default shader has disc and stars only', () => {
  const s = fs({});
  assert.match(s, /#define HAS_DISC/);
  assert.match(s, /#define UNIVERSE_STARS/);
  assert.doesNotMatch(s, /OBJ_COUNT/);
  assert.doesNotMatch(s, /HAS_TEDDY/);
  assert.doesNotMatch(s, /sdStar/);
});

test('one cereal orb compiles in only what it needs', () => {
  const s = fs({ toys: { objects: [{ shape: 'orb', skin: 'cereal' }] } });
  assert.match(s, /#define OBJ_COUNT 1/);
  assert.match(s, /SKIN_CEREAL/);
  assert.doesNotMatch(s, /SKIN_METAL/);
  assert.doesNotMatch(s, /sdTorus/);
});

test('representative shaders are structurally sound', () => {
  const combos = [
    {},
    { disc: { amount: 0 } },
    { universe: { mode: 'plain' } },
    { universe: { mode: 'photo', photo: 'https://x.y/a.jpg' } },
    { toys: { teddy: true, objects: [{ skin: 'metal' }, { skin: 'fluffy' }, { skin: 'rocky' }] } },
    { quality: 'sharper', disc: { colorMode: 'custom' } },
  ];
  for (const c of combos) {
    const s = fs(c);
    const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
    assert.equal(open, close, JSON.stringify(c));
    assert.equal(s.split('void main()').length - 1, 1, JSON.stringify(c));
  }
});

test('features key changes with features but not with slider values', () => {
  const a = JSON.stringify(BH.features(BH.normalize({ mass: 0.1 })));
  const b = JSON.stringify(BH.features(BH.normalize({ mass: 0.9, glow: 0 })));
  assert.equal(a, b);
  assert.notEqual(a, JSON.stringify(BH.features(BH.normalize({ toys: { teddy: true } }))));
});
