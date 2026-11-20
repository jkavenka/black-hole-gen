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
  BH.discOmega = function (r, scale, pace) { return pace * 0.6 * Math.pow(r, -1.5) / scale; };

  // Brightening/colour factor for disc gas at radius r. cosTheta: gas velocity vs direction toward the camera.
  BH.discDoppler = function (r, cosTheta) {
    var beta = Math.sqrt(0.5 / (r - 1)), gamma = 1 / Math.sqrt(1 - beta * beta);
    return Math.sqrt(1 - 1.5 / r) / (gamma * (1 - beta * cosTheta));
  };

  function smoothstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // A teddy falling straight in, as seen from far away: it slows, reddens and fades, but never crosses.
  BH.teddyStep = function (s, dt) {
    var r = s.r, r0 = s.r0, n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (var i = 0; i < n; i++) {
      var dr = -(1 - 1 / r) * Math.sqrt(Math.max(0, 1 / r - 1 / r0)) / Math.sqrt(1 - 1 / r0);
      r = Math.max(1 + 1e-9, r + dr * h);
    }
    var v = Math.min(0.999999, Math.sqrt(Math.max(0, (1 / r - 1 / r0) / (1 - 1 / r0))));
    var g = Math.sqrt(1 - 1 / r) * Math.sqrt((1 - v) / (1 + v));
    var brightness = g * g * g;
    return { r: r, r0: r0, g: g, brightness: brightness, stretch: 1 + 0.25 * smoothstep(6, 1.5, r), done: brightness < 0.02 };
  };

  // A toy's position on a circular orbit, tilted about the x-axis. The disc is the plane y = 0.
  BH.orbitPosition = function (radius, tiltDeg, phaseDeg, t, scale, pace) {
    var a = phaseDeg * Math.PI / 180 + BH.discOmega(radius, scale, pace) * t;
    var ti = tiltDeg * Math.PI / 180;
    var x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    return [x, z * Math.sin(ti), z * Math.cos(ti)];
  };
});
