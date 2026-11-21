(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('physics', true, function (BH) {
  // Units: horizon radius r_s = 1, speed of light c = 1.
  BH.CRITICAL_B = 1.5 * Math.sqrt(3); // rays passing closer than this fall in: the shadow's edge

  // Light in the hole's gravity, in the ray's own plane: u = 1/r, u'' = -u + 1.5 u^2 (derivatives in angle phi).
  function rk4(u, w, h) {
    function f(u) { return -u + 1.5 * u * u; }
    var k1u = w, k1w = f(u);
    var k2u = w + 0.5 * h * k1w, k2w = f(u + 0.5 * h * k1u);
    var k3u = w + 0.5 * h * k2w, k3w = f(u + 0.5 * h * k2u);
    var k4u = w + h * k3w, k4w = f(u + h * k3u);
    return [u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w)];
  }
  BH.rk4Photon = rk4;

  // Reference tracer: photon starting at distance D heading inward with impact parameter b.
  BH.traceRay = function (D, b, opts) {
    var h = (opts && opts.step) || 0.01;
    var u0 = 1 / D, u = u0, w = Math.sqrt(Math.max(0, 1 / (b * b) - u0 * u0 + u0 * u0 * u0)), phi = 0;
    for (var i = 0; i < 200000; i++) {
      var n = rk4(u, w, h);
      if (n[0] >= 1) return { captured: true, deflection: NaN };
      if (n[0] <= 0) {
        phi += h * u / (u - n[0]);
        return { captured: false, deflection: phi - (Math.PI - Math.asin(Math.min(1, b * u0))) };
      }
      u = n[0]; w = n[1]; phi += h;
    }
    return { captured: true, deflection: NaN };
  };

  // How fast the disc turns on screen at radius r. Heavier holes (bigger scale) turn slower.
  BH.discOmega = function (r, scale, pace) { return pace * 1.2 * Math.pow(r, -1.5) / scale; };

  // Brightening/colour factor for disc gas at radius r. cosTheta: gas velocity vs direction toward the camera.
  BH.discDoppler = function (r, cosTheta) {
    var beta = Math.sqrt(0.5 / (r - 1)), gamma = 1 / Math.sqrt(1 - beta * beta);
    return Math.sqrt(1 - 1.5 / r) / (gamma * (1 - beta * cosTheta));
  };

  // ---------- real units (only for the read-outs; the picture is drawn in horizon units) ----------
  // "How heavy" 0..1 → 10 Suns (a star's leftover) … 4.3 million Suns (the hole at our galaxy's centre).
  BH.massSuns = function (mass) { return 10 * Math.pow(4.3e5, mass); };
  var SEC_PER_RS = 9.85e-6; // light crosses one horizon radius of a 1-Sun hole in 9.85 microseconds
  // Real seconds in one unit of the engine's disc clock (pace 1, scale 1): the disc turns 1.2 r^-1.5 per unit,
  // real gas turns sqrt(GM/r^3) = sqrt(0.5) r^-1.5 per r_s/c.
  BH.realSecondsPerDiscUnit = function (mass) { return 1.2 / Math.SQRT1_2 * SEC_PER_RS * BH.massSuns(mass); };
  // Tidal stretch on a teddy-sized thing scales as 1/M^2: small holes stretch hard, giant ones barely.
  BH.tidal = function (mass) { return 6 * Math.pow(10, -3 * mass); };

  // A teddy falling straight in, as seen from far away: it slows, reddens, stretches and fades, but never crosses.
  BH.teddyStep = function (s, dt, mass) {
    var r = s.r, r0 = s.r0, n = Math.min(2000, Math.max(1, Math.ceil(dt / 0.02))), h = dt / n;
    for (var i = 0; i < n; i++) {
      var dr = -(1 - 1 / r) * Math.sqrt(Math.max(0, 1 / r - 1 / r0)) / Math.sqrt(1 - 1 / r0);
      r = Math.max(1 + 1e-9, r + dr * h);
    }
    var v = Math.min(0.999999, Math.sqrt(Math.max(0, (1 / r - 1 / r0) / (1 - 1 / r0))));
    var g = Math.sqrt(1 - 1 / r) * Math.sqrt((1 - v) / (1 + v));
    // Its own light dims as g^3, but falling past the glowing disc it is lit ever more brightly, which roughly
    // cancels two of those powers. So: visible until g is small, reddening all the way (the tint uses g).
    var brightness = Math.max(0, Math.min(1, 1.6 * g - 0.1));
    var stretch = Math.min(5, 1 + BH.tidal(mass == null ? 0.5 : mass) * Math.pow(2 / r, 3));
    return { r: r, r0: r0, g: g, brightness: brightness, stretch: stretch, done: brightness < 0.03 };
  };

  // The bear's own watch, in r_s/c: proper time to fall from rest at r0 to the horizon (a cycloid).
  BH.teddyOwnWatch = function (r0) {
    var eta = Math.acos(2 / r0 - 1);
    return Math.sqrt(r0 * r0 * r0 / 4) * (eta + Math.sin(eta));
  };

  // How long a small thing on a circular orbit takes to spiral in by giving off gravitational waves (Peters 1964).
  BH.inspiralYears = function (massSuns, orbitRs, objectKg) {
    var G = 6.674e-11, c = 2.998e8, M = massSuns * 1.989e30, a = orbitRs * 2 * G * M / (c * c);
    var sec = 5 / 256 * Math.pow(c, 5) * Math.pow(a, 4) / (G * G * G * M * objectKg * (M + objectKg));
    return sec / 3.15576e7;
  };

  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function num(v) { return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)); }
  function unit(v, one, many) { var t = num(v); return t + ' ' + (t === '1' ? one : many); }
  BH.plainDuration = function (sec) {
    if (sec < 60) return unit(sec, 'second', 'seconds');
    if (sec < 3600) return unit(sec / 60, 'minute', 'minutes');
    if (sec < 86400) return unit(sec / 3600, 'hour', 'hours');
    var y = sec / 3.15576e7;
    if (y < 1) return unit(sec / 86400, 'day', 'days');
    if (y < 1e3) return unit(y, 'year', 'years');
    if (y < 1e6) return num(y / 1e3) + ' thousand years';
    if (y < 1e9) return num(y / 1e6) + ' million years';
    if (y < 1e12) return num(y / 1e9) + ' billion years';
    var e = Math.floor(Math.log10(y));
    return '10' + String(e).split('').map(function (d) { return SUP[+d]; }).join('') + ' years';
  };

  // A toy's position on a circular orbit, tilted about the x-axis. The disc is the plane y = 0.
  BH.orbitPosition = function (radius, tiltDeg, phaseDeg, t, scale, pace) {
    var a = phaseDeg * Math.PI / 180 + BH.discOmega(radius, scale, pace) * t;
    var ti = tiltDeg * Math.PI / 180;
    var x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    return [x, z * Math.sin(ti), z * Math.cos(ti)];
  };
});
