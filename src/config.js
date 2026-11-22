(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('config', true, function (BH) {
  // Every setting, its default and its allowed range. The look you get on first load is the "calm" one.
  var SCHEMA = {
    mass: [0.5, 0, 1],
    glow: [0.8, 0, 1],
    pace: [1, 0.25, 2],
    time: [0, -1, 12], // speed of time: 10^time (0 = ×1, 12 = ×1 trillion)
    quality: ['auto', ['auto', 'lighter', 'sharper']],
    disc: {
      amount: [0.6, 0, 1],
      brightness: [1, 0, 2],
      width: [0.5, 0, 1],
      colorMode: ['true', ['true', 'custom']],
      colorA: ['#ffe2b0', 'color'],
      colorB: ['#c8602a', 'color'],
      turbulence: [0.5, 0, 1],
    },
    view: {
      closer: [0, 0, 1],
      tilt: [80, 0, 89],
      yaw: [0, 'angle'],
      drift: [true, 'bool'],
      zoom: [1, 0.5, 4],
      x: [0.5, -0.5, 1.5],
      y: [0.5, -0.5, 1.5],
    },
    universe: {
      mode: ['stars', ['stars', 'plain', 'photo']],
      stars: [0.7, 0, 1],
      galaxy: [0.5, 0, 1],
      nebula: [0.4, 0, 1],
      nebulaA: ['#2C46C8', 'color'],
      nebulaB: ['#6A35B8', 'color'],
      plain: ['#0A0816', 'color'],
      photo: [null, 'photo'],
      photoKind: ['flat', ['flat', 'pano']],
      photoSize: ['medium', ['small', 'medium', 'large']],
    },
    toys: {
      objects: [[], 'objects'],
      teddy: [false, 'bool'],
    },
  };
  var OBJECT = {
    shape: ['orb', ['orb', 'star', 'torus']],
    skin: ['rocky', ['rocky', 'bubbly', 'cereal', 'metal']],
    orbit: [0.5, 0, 1],
    tilt: [25, -45, 45],
    phase: [0, 'angle'],
  };
  var MAX_OBJECTS = 3;

  function isLeaf(s) { return Array.isArray(s); }
  function wrapAngle(a) { a = a % 360; return a < 0 ? a + 360 : a; }

  function value(spec, v) {
    var def = spec[0], kind = spec[1];
    if (Array.isArray(kind)) return kind.indexOf(v) >= 0 ? v : def;
    if (kind === 'color') return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def;
    if (kind === 'bool') return typeof v === 'boolean' ? v : def;
    if (kind === 'angle') return typeof v === 'number' && isFinite(v) ? wrapAngle(v) : def;
    // links may not carry anything that could break out of HTML (<, >, quotes, spaces); data URLs must be plain base64 images
    if (kind === 'photo') return typeof v === 'string' && /^(data:image\/[a-z+.-]+;base64,[A-Za-z0-9+\/=]+|https?:\/\/[^\s<>"'`\\]+)$/.test(v) ? v : null;
    if (kind === 'objects') {
      if (!Array.isArray(v)) return [];
      return v.slice(0, MAX_OBJECTS).map(function (o) {
        o = o && typeof o === 'object' ? o : {};
        if (o.skin === 'fluffy') o = Object.assign({}, o, { skin: 'bubbly' }); // fluffy became bubbly
        return group(OBJECT, o);
      });
    }
    if (typeof v !== 'number' || !isFinite(v)) return def;
    return Math.min(spec[2], Math.max(kind, v));
  }

  function group(schema, src) {
    var out = {};
    for (var k in schema) {
      var s = schema[k], v = src ? src[k] : undefined;
      out[k] = isLeaf(s) ? value(s, v) : group(s, v && typeof v === 'object' ? v : {});
    }
    return out;
  }

  BH.normalize = function (partial) { return group(SCHEMA, partial && typeof partial === 'object' ? partial : {}); };
  BH.DEFAULTS = BH.normalize({});
  BH.MAX_OBJECTS = MAX_OBJECTS;

  // Only the fields that differ from DEFAULTS go in the link; embedded photos never do.
  function diff(a, b) {
    var out = {}, any = false;
    for (var k in a) {
      if (k === 'objects') { if (a[k].length) { out[k] = a[k]; any = true; } continue; }
      if (k === 'photo') { if (a[k] && !/^data:/.test(a[k])) { out[k] = a[k]; any = true; } continue; }
      if (a[k] && typeof a[k] === 'object') {
        var d = diff(a[k], b[k]);
        if (d) { out[k] = d; any = true; }
      } else if (a[k] !== b[k]) { out[k] = a[k]; any = true; }
    }
    return any ? out : null;
  }
  function b64urlEncode(s) {
    var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8');
  }
  BH.encodeHash = function (cfg) {
    var d = diff(BH.normalize(cfg), BH.DEFAULTS);
    return d ? '#c=' + b64urlEncode(JSON.stringify(d)) : '';
  };
  BH.decodeHash = function (str) {
    var m = /c=([A-Za-z0-9_-]+)/.exec(str || '');
    if (!m) return BH.normalize({});
    try { return BH.normalize(JSON.parse(b64urlDecode(m[1]))); } catch (e) { return BH.normalize({}); }
  };

  function smoothstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // Numbers the renderer needs, in units of the horizon radius (r_s = 1).
  // "How heavy" only changes image scale (and pace via scale); only "Come closer" changes the distance.
  BH.derive = function (cfg, viewport) {
    var mobile = viewport.w < 768;
    var scale = Math.pow(2, (cfg.mass - 0.5) * 2) * (mobile ? 1.35 : 1);
    var ease = smoothstep(0, 1, cfg.view.closer), D = 30 + (6 - 30) * ease;
    // The view widens as you approach, so the shadow grows from 1/5 of the frame to at most 4/5 — never a black screen.
    var shadow = Math.asin(Math.min(1, 1.5 * Math.sqrt(3) / D * Math.sqrt(1 - 1 / D)));
    var short = viewport.h > viewport.w ? viewport.w / viewport.h : 1; // portrait: size it by the shorter side
    var frac = Math.min(0.8, (0.2 + 0.35 * ease) * scale) * short;
    var base = Math.min(2.0, 2 * shadow / frac); // never wider than ~115°: no fish-eye
    // Zoom is a camera lens (it magnifies), not a step closer. It stops before the shadow fills 85% of the frame.
    var fov = 2 * Math.atan(Math.tan(base / 2) / (cfg.view.zoom || 1));
    fov = Math.min(2.0, Math.max(fov, 2 * shadow / (0.85 * short)));
    return {
      distance: D,
      scale: scale,
      fovY: fov,
      baseFovY: base,
      discOuter: 8 + 22 * cfg.disc.width,
      mobile: mobile,
    };
  };
  // Nebula slider → glow strength. Gentle at the calm default, clearly coloured when turned up.
  BH.nebulaStrength = function (n) { return 0.34 * n * (0.6 + 1.5 * n); };
  BH.toyOrbitRadius = function (orbit) { return 6 + orbit * 12; }; // inside the calm camera distance; toys pass through the glow and behind the hole
});
