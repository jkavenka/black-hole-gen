const test = require('node:test');
const assert = require('node:assert/strict');
const BH = require('../src/physics.js');
require('../src/config.js');

test('rays just inside the critical impact parameter are captured', () => {
  assert.ok(Math.abs(BH.CRITICAL_B - 2.598076) < 1e-6);
  assert.equal(BH.traceRay(1000, 2.55).captured, true);
  assert.equal(BH.traceRay(1000, 2.65).captured, false);
});

test('weak-field deflection is about 2/b', () => {
  const d = BH.traceRay(10000, 200).deflection;
  assert.ok(Math.abs(d - 2 / 200) / (2 / 200) < 0.1, 'deflection ' + d);
});

test('inner disc turns once in about half a minute at calm settings', () => {
  const period = 2 * Math.PI / BH.discOmega(3, 1, 1);
  assert.ok(period > 20 && period < 35, 'period ' + period);
});

test('disc spins faster inside, slower when heavier', () => {
  assert.ok(BH.discOmega(3, 1, 1) > BH.discOmega(6, 1, 1));
  assert.ok(BH.discOmega(6, 2, 1) < BH.discOmega(6, 1, 1));
});

test('Doppler: approaching side brighter, transverse redshifted', () => {
  assert.ok(BH.discDoppler(6, 1) > 1);
  assert.ok(BH.discDoppler(6, -1) < 1);
  assert.ok(BH.discDoppler(6, 0) < 1);
});

test('teddy slows, reddens, fades, never crosses, stays gentle', () => {
  let s = { r: 20, r0: 20.5 };
  let prev = BH.teddyStep(s, 0);
  let done = false;
  for (let i = 0; i < 10000; i++) {
    const n = BH.teddyStep(prev, 0.05);
    assert.ok(n.r < prev.r || n.r === prev.r && n.done, 'r decreasing at ' + i);
    assert.ok(n.r > 1);
    assert.ok(n.g <= prev.g);
    assert.ok(n.stretch <= 1.25);
    if (n.done) { done = true; break; }
    prev = n;
  }
  assert.ok(done, 'teddy reached the faded state');
});

test('teddy large step stays finite', () => {
  const n = BH.teddyStep({ r: 20, r0: 20.5 }, 10);
  assert.ok(n.r > 1 && Number.isFinite(n.r) && Number.isFinite(n.g));
});

test('orbit with tilt 0 stays in the disc plane at the right radius', () => {
  for (let t = 0; t < 50; t += 3.7) {
    const p = BH.orbitPosition(12, 0, 30, t, 1, 1);
    assert.ok(Math.abs(p[1]) < 1e-9);
    assert.ok(Math.abs(Math.hypot(p[0], p[1], p[2]) - 12) < 1e-9);
  }
});
