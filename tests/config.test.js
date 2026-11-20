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
    assert.equal(o.tilt, 10);
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

test('derive: phone viewport scales by 1.35', () => {
  const desk = BH.derive(BH.DEFAULTS, { w: 1440, h: 900 });
  const phone = BH.derive(BH.DEFAULTS, { w: 375, h: 700 });
  assert.equal(phone.mobile, true);
  assert.equal(desk.mobile, false);
  assert.ok(Math.abs(phone.scale - desk.scale * 1.35) < 1e-9);
});

test('derive: toy orbit radius sits outside the disc', () => {
  const d = BH.derive(BH.normalize({ disc: { width: 1 } }), { w: 1000, h: 800 });
  assert.equal(BH.toyOrbitRadius(0, d), d.discOuter + 3);
  assert.equal(BH.toyOrbitRadius(1, d), d.discOuter + 18);
});

test('encodeHash never contains a data: photo', () => {
  const cfg = BH.normalize({ universe: { mode: 'photo', photo: 'data:image/jpeg;base64,AAAA' } });
  const back = BH.decodeHash(BH.encodeHash(cfg));
  assert.equal(back.universe.photo, null);
  const cfg2 = BH.normalize({ universe: { mode: 'photo', photo: 'https://example.com/a.jpg' } });
  assert.equal(BH.decodeHash(BH.encodeHash(cfg2)).universe.photo, 'https://example.com/a.jpg');
});
