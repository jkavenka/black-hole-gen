const test = require('node:test');
const assert = require('node:assert/strict');
const BH = require('../src/config.js');

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('normalize({}) equals DEFAULTS', () => {
  assert.deepEqual(BH.normalize({}), BH.DEFAULTS);
});

test('normalize clamps ranges and caps objects at 3 with defaults filled', () => {
  const c = BH.normalize({ view: { closer: 5, tilt: -10 }, toys: { objects: [{}, {}, {}, {}] } });
  assert.equal(c.view.closer, 1);
  assert.equal(c.view.tilt, 0);
  assert.equal(c.toys.objects.length, 3);
  for (const o of c.toys.objects) {
    assert.equal(o.shape, 'orb');
    assert.equal(o.skin, 'rocky');
    assert.equal(o.orbit, 0.5);
    assert.equal(o.tilt, 25);
    assert.ok(o.phase >= 0 && o.phase < 360);
  }
});

test('normalize rejects unknown enums and bad colours', () => {
  const c = BH.normalize({ universe: { mode: 'banana', plain: '#zzz' } });
  assert.equal(c.universe.mode, 'stars');
  assert.equal(c.universe.plain, BH.DEFAULTS.universe.plain);
});

test('hash round-trips a modified config', () => {
  const cfg = BH.normalize({
    mass: 0.8, glow: 0.3, pace: 1.5,
    disc: { colorMode: 'custom', colorA: '#7fe3ff' },
    view: { closer: 0.4 },
    toys: { objects: [{ shape: 'orb', skin: 'cereal', phase: 90 }, { skin: 'metal', phase: 200 }] },
  });
  assert.deepEqual(BH.decodeHash(BH.encodeHash(cfg)), cfg);
});

test('decodeHash survives garbage and keeps valid fields', () => {
  assert.deepEqual(BH.decodeHash('#c=!!!garbage'), BH.DEFAULTS);
  assert.deepEqual(BH.decodeHash(''), BH.DEFAULTS);
  const c = BH.decodeHash('#c=' + b64url('{"mass":"heavy","disc":{"amount":0.9}}'));
  assert.equal(c.mass, 0.5);
  assert.equal(c.disc.amount, 0.9);
});

test('derive: extremes stay finite and never closer than 6', () => {
  const d = BH.derive(BH.normalize({ view: { closer: 1 }, mass: 1, disc: { width: 1 } }), { w: 1440, h: 900 });
  assert.equal(d.distance, 6);
  for (const v of Object.values(d)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
  assert.equal(BH.derive(BH.DEFAULTS, { w: 1440, h: 900 }).distance, 30);
});

test('derive: the shadow never fills more than 4/5 of the frame', () => {
  for (const closer of [0, 0.5, 1]) for (const mass of [0, 0.5, 1]) {
    const d = BH.derive(BH.normalize({ mass, view: { closer } }), { w: 375, h: 700 });
    const shadow = 2 * Math.asin(1.5 * Math.sqrt(3) / d.distance * Math.sqrt(1 - 1 / d.distance));
    assert.ok(shadow / d.fovY <= 0.8 + 1e-9, `closer ${closer} mass ${mass}: ${shadow / d.fovY}`);
    assert.ok(d.fovY <= 2.0 + 1e-9, `closer ${closer} mass ${mass}: fov ${d.fovY}`);
  }
  const calm = BH.derive(BH.DEFAULTS, { w: 1440, h: 900 });
  assert.ok(Math.abs(calm.fovY - 0.852) < 0.01);
});

test('derive: phone viewport scales by 1.35', () => {
  const desk = BH.derive(BH.DEFAULTS, { w: 1440, h: 900 });
  const phone = BH.derive(BH.DEFAULTS, { w: 375, h: 700 });
  assert.equal(phone.mobile, true);
  assert.equal(desk.mobile, false);
  assert.ok(Math.abs(phone.scale - desk.scale * 1.35) < 1e-9);
});

test('toy orbits sit between 6 and 18, well inside the calm camera distance', () => {
  const d = BH.derive(BH.normalize({ disc: { width: 1 } }), { w: 1000, h: 800 });
  assert.equal(BH.toyOrbitRadius(0, d), 6);
  assert.equal(BH.toyOrbitRadius(1, d), 18);
  assert.ok(BH.toyOrbitRadius(1, d) < BH.derive(BH.DEFAULTS, { w: 1000, h: 800 }).distance - 8);
});

test('encodeHash never contains a data: photo', () => {
  const cfg = BH.normalize({ universe: { mode: 'photo', photo: 'data:image/jpeg;base64,AAAA' } });
  const back = BH.decodeHash(BH.encodeHash(cfg));
  assert.equal(back.universe.photo, null);
  const cfg2 = BH.normalize({ universe: { mode: 'photo', photo: 'https://example.com/a.jpg' } });
  assert.equal(BH.decodeHash(BH.encodeHash(cfg2)).universe.photo, 'https://example.com/a.jpg');
});

test('portrait phones frame the hole by the shorter side (width)', () => {
  const d = BH.derive(BH.DEFAULTS, { w: 375, h: 812 });
  const shadow = 2 * Math.asin(1.5 * Math.sqrt(3) / d.distance * Math.sqrt(1 - 1 / d.distance));
  const ofWidth = (shadow / d.fovY) * 812 / 375;
  assert.ok(Math.abs(ofWidth - 0.27) < 0.01, 'shadow is ' + ofWidth + ' of the width');
});

test('old "fluffy" links become bubbly', () => {
  const c = BH.normalize({ toys: { objects: [{ skin: 'fluffy' }] } });
  assert.equal(c.toys.objects[0].skin, 'bubbly');
});

test('zoom and time have calm defaults and safe ranges', () => {
  assert.equal(BH.DEFAULTS.view.zoom, 1);
  assert.equal(BH.DEFAULTS.time, 0);
  const c = BH.normalize({ view: { zoom: 99, x: -3 }, time: 40 });
  assert.equal(c.view.zoom, 4);
  assert.equal(c.view.x, -0.5);
  assert.equal(c.time, 12);
  assert.equal(BH.normalize({ view: { zoom: 0 }, time: -9 }).view.zoom, 0.5);
  assert.equal(BH.normalize({ time: -9 }).time, -1);
});

test('zooming never lets the shadow fill the frame, and never goes fish-eye', () => {
  for (const zoom of [0.5, 1, 2, 4]) for (const closer of [0, 1]) for (const mass of [0, 1]) for (const vp of [{ w: 1440, h: 900 }, { w: 375, h: 800 }]) {
    const d = BH.derive(BH.normalize({ mass, view: { closer, zoom } }), vp);
    const shadow = 2 * Math.asin(1.5 * Math.sqrt(3) / d.distance * Math.sqrt(1 - 1 / d.distance));
    const short = Math.min(vp.w, vp.h) / vp.h;
    assert.ok(shadow / d.fovY <= 0.85 * short + 1e-9 || d.fovY >= 2.0 - 1e-9, `zoom ${zoom} closer ${closer} mass ${mass}`);
    assert.ok(shadow / d.fovY <= 0.85 + 1e-9);
    assert.ok(d.fovY <= 2.0 + 1e-9);
  }
  const z1 = BH.derive(BH.DEFAULTS, { w: 1440, h: 900 }), z2 = BH.derive(BH.normalize({ view: { zoom: 2 } }), { w: 1440, h: 900 });
  assert.ok(Math.abs(Math.tan(z1.fovY / 2) / Math.tan(z2.fovY / 2) - 2) < 0.05, 'zoom 2 magnifies about 2×');
  assert.equal(z2.baseFovY, z1.fovY, 'the photo plate keeps its size when zooming');
});

test('nebula: default looks about the same as before, turning it up really shows the colours', () => {
  const old = (n) => 0.34 * n; // strength before this fix
  assert.equal(BH.nebulaStrength(0), 0);
  const d = BH.nebulaStrength(0.4) / old(0.4);
  assert.ok(d > 1 && d < 1.3, 'default changed by ' + d);
  assert.ok(BH.nebulaStrength(1) / BH.nebulaStrength(0.4) > 4, 'slider range too flat');
});
