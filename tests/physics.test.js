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
    assert.ok(n.stretch <= 5);
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

test('"How heavy" maps to 10 Suns … 4.3 million Suns', () => {
  assert.ok(Math.abs(BH.massSuns(0) - 10) < 1e-6);
  assert.ok(Math.abs(BH.massSuns(1) / 4.3e6 - 1) < 1e-6);
  assert.ok(BH.massSuns(0.5) > 5000 && BH.massSuns(0.5) < 8000);
});

test('one unit of disc time is real seconds that grow with the mass', () => {
  // inner disc orbit at r=3 is 2π·sqrt(2·27) r_s/c ≈ 46 light-crossings of the horizon
  const T = 2 * Math.PI / BH.discOmega(3, 1, 1); // disc-time units per inner orbit
  const real = T * BH.realSecondsPerDiscUnit(0.5);
  const expect = 2 * Math.PI * Math.sqrt(2 * 27) * 9.85e-6 * BH.massSuns(0.5);
  assert.ok(Math.abs(real / expect - 1) < 0.02, real + ' vs ' + expect);
});

test('teddy: light holes stretch it a lot, heavy ones barely; never more than 5×', () => {
  const run = (mass) => { let s = BH.teddyStep({ r: 9, r0: 9.5 }, 0, mass), max = 1; for (let i = 0; i < 20000 && !s.done; i++) { s = BH.teddyStep(s, 0.05, mass); max = Math.max(max, s.stretch); } return max; };
  const light = run(0), mid = run(0.5), heavy = run(1);
  assert.ok(light > 3 && light <= 5, 'light ' + light);
  assert.ok(mid > 1.5 && mid < light, 'mid ' + mid);
  assert.ok(heavy < 1.15, 'heavy ' + heavy);
});

test('teddy step with an enormous time jump returns at once and stays finite', () => {
  const t0 = Date.now();
  const n = BH.teddyStep({ r: 9, r0: 9.5 }, 1e12, 0.5);
  assert.ok(Date.now() - t0 < 200);
  assert.ok(n.r > 1 && Number.isFinite(n.g) && n.done);
});

test("bear's own watch: proper time to the horizon matches a direct integral", () => {
  const r0 = 9;
  let tau = 0; const N = 200000;
  for (let i = 0; i < N; i++) { const r = 1 + (r0 - 1) * (i + 0.5) / N; tau += ((r0 - 1) / N) / Math.sqrt(1 / r - 1 / r0); }
  // the integrand blows up gently at r0; the closed form is exact
  assert.ok(Math.abs(BH.teddyOwnWatch(r0) / tau - 1) < 0.01, BH.teddyOwnWatch(r0) + ' vs ' + tau);
});

test('a cereal star would take far longer than the universe to spiral in', () => {
  const y = BH.inspiralYears(BH.massSuns(0.5), 12, 1e-3);
  assert.ok(y > 1e30 && y < 1e33, String(y));
});

test('durations read in plain words', () => {
  assert.equal(BH.plainDuration(0.11), '0.1 seconds');
  assert.equal(BH.plainDuration(1), '1 second');
  assert.equal(BH.plainDuration(90), '1.5 minutes');
  assert.equal(BH.plainDuration(3 * 86400), '3 days');
  assert.equal(BH.plainDuration(3.156e7), '1 year');
  assert.equal(BH.plainDuration(3.156e7 * 2.5e6), '2.5 million years');
  assert.equal(BH.plainDuration(3.156e7 * 1e31), '10³¹ years');
});
