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
    { toys: { teddy: true, objects: [{ skin: 'metal' }, { skin: 'bubbly' }, { skin: 'rocky' }] } },
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

test('star shape ships only star code', () => {
  const s = fs({ toys: { objects: [{ shape: 'star', skin: 'cereal' }] } });
  assert.match(s, /#define HAS_SHAPE_STAR/);
  assert.match(s, /sdStar/);
  assert.doesNotMatch(s, /sdTorus/);
});

test('torus shape ships only torus code', () => {
  const s = fs({ toys: { objects: [{ shape: 'torus', skin: 'metal' }] } });
  assert.match(s, /#define HAS_SHAPE_TORUS/);
  assert.match(s, /sdTorus/);
  assert.doesNotMatch(s, /sdStar/);
});

test('bubbly skin ships its film code and nothing called fluffy', () => {
  const s = fs({ toys: { objects: [{ skin: 'bubbly' }] } });
  assert.match(s, /SKIN_BUBBLY/);
  assert.match(s, /film/);
  assert.doesNotMatch(s, /fluffy/i);
});

test('photo universe blends with mip levels; panoramas avoid the seam when derivatives exist', () => {
  const f = BH.features(BH.normalize({ universe: { mode: 'photo', photo: 'https://x.y/a.jpg', photoKind: 'pano' } }));
  const plain = BH.buildFragmentShader(f);
  assert.doesNotMatch(plain, /GL_OES_standard_derivatives/);
  const withD = BH.buildFragmentShader(Object.assign({}, f, { deriv: true }));
  assert.match(withD.split('\n')[0], /#extension GL_OES_standard_derivatives : enable/);
  assert.match(withD, /fwidth/);
  assert.match(withD, /vec3 sky=universe\(esc\)/, 'sampled outside the branch so mip selection is well defined');
});

test('fast time smears the disc and the toys', () => {
  const s = fs({ toys: { objects: [{ skin: 'cereal' }] } });
  assert.match(s, /uDiscStep/);
  assert.match(s, /uObjRing/);
  assert.match(s, /uObjPlane/);
});

test('teddy tumbles', () => {
  assert.match(fs({ toys: { teddy: true } }), /uTeddySpin/);
});
