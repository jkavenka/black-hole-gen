(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('engine', true, function (BH) {
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  var RAD = Math.PI / 180;
  var SCALES = { lighter: 0.35, auto: 0.5, sharper: 0.75 };

  BH.createEngine = function (root, cfg, opts) {
    opts = opts || {};
    cfg = BH.normalize(cfg);
    var api = { ok: false };
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    root.appendChild(canvas);
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }

    var warned = false;
    function fail(msg) {
      api.ok = false;
      stop();
      canvas.style.display = 'none';
      root.style.background = cfg.universe.plain;
      if (!warned && typeof console !== 'undefined') { warned = true; console.warn('[black hole] ' + msg + ' — showing a plain background instead.'); }
    }

    var prog = null, progKey = '', U = {}, quad = null, photoTex = null, photoReady = false, hooks = [];
    var W = 0, H = 0, DPR = 1, rs = SCALES[cfg.quality] || 0.5, d = null;
    var t = 0, discT = 0, last = 0, running = false, raf = 0, visible = true, ema = 16.7, lastAdapt = 0, holdUp = 0, fps = 60, frameAcc = 0, frameN = 0, fpsT = 0;
    var view = { yaw: cfg.view.yaw, tilt: cfg.view.tilt }, drift = 0;
    var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    api.hooks = hooks; // later modules (toys) attach per-frame uniform setters here

    function compile(src, type) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    function build() {
      var f = BH.features(cfg);
      if (f.universe === 'photo' && !photoTex) { f.universe = 'stars'; f.photoKind = null; } // until the photo arrives (or if it never does)
      var key = JSON.stringify(f);
      if (key === progKey && prog) return true;
      try {
        var p = gl.createProgram();
        gl.attachShader(p, compile(BH.VERTEX_SHADER, gl.VERTEX_SHADER));
        gl.attachShader(p, compile(BH.buildFragmentShader(f), gl.FRAGMENT_SHADER));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
        if (prog) gl.deleteProgram(prog);
        prog = p; progKey = key; U = {};
        gl.useProgram(prog);
        var n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(prog, i), nm = info.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(prog, info.name); }
        if (!quad) { quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); }
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        var la = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
        api.ok = true;
        canvas.style.display = 'block';
        root.style.background = '';
        return true;
      } catch (e) { fail(e.message); return false; }
    }

    function set1(n, v) { if (U[n]) gl.uniform1f(U[n], v); }
    function set3(n, v) { if (U[n]) gl.uniform3fv(U[n], v); }
    api.uniforms = function () { return { gl: gl, U: U, set1: set1, set3: set3 }; };

    function resize() {
      W = root.clientWidth; H = root.clientHeight;
      DPR = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
      d = BH.derive(cfg, { w: W, h: H });
      if (!gl || !W || !H) return;
      var s = rs;
      if (d.mobile && opts.mobileAuto) s = Math.min(s, 0.35);
      var cw = Math.max(1, Math.round(W * DPR * s)), ch = Math.max(1, Math.round(H * DPR * s));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function camera() {
      var yaw = (view.yaw + drift) * RAD, th = view.tilt * RAD, D = d.distance;
      var cam = [D * Math.sin(th) * Math.sin(yaw), D * Math.cos(th), D * Math.sin(th) * Math.cos(yaw)];
      var fwd = [-cam[0] / D, -cam[1] / D, -cam[2] / D];
      var right = [Math.cos(yaw), 0, -Math.sin(yaw)];
      var up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      return { cam: cam, fwd: fwd, right: right, up: up };
    }

    function draw() {
      if (!api.ok || !W || !H) return;
      var c = camera(), tn = Math.tan(d.fovY / 2), dc = cfg.disc, un = cfg.universe;
      gl.useProgram(prog);
      if (U.uRes) gl.uniform2f(U.uRes, canvas.width, canvas.height);
      if (U.uHole) gl.uniform2f(U.uHole, cfg.view.x * canvas.width, (1 - cfg.view.y) * canvas.height);
      set3('uCam', c.cam); set3('uFwd', c.fwd); set3('uRight', c.right); set3('uUp', c.up);
      set1('uTan', tn); set1('uPix', 2 * tn / canvas.height); set1('uTime', t);
      set3('uPlain', rgb(un.plain));
      set1('uStars', un.stars); set1('uGalaxy', un.galaxy); set1('uNebula', un.nebula);
      set3('uNebA', rgb(un.nebulaA)); set3('uNebB', rgb(un.nebulaB));
      set1('uDiscAmount', dc.amount); set1('uDiscBright', dc.brightness); set1('uDiscOuter', d.discOuter);
      set1('uTurb', dc.turbulence); set1('uGlow', cfg.glow); set3('uColA', rgb(dc.colorA)); set3('uColB', rgb(dc.colorB));
      set1('uColorMode', dc.colorMode === 'custom' ? 1 : 0); set1('uDiscTime', discT);
      if (U.uPhoto && photoTex) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex); gl.uniform1i(U.uPhoto, 0);
        // the photo plate faces the default (calm) view, so turning around shows its mirrored repeat
        var y0 = cfg.view.yaw * RAD;
        set3('uPhotoFwd', [-Math.sin(y0), 0, -Math.cos(y0)]); set3('uPhotoRight', [Math.cos(y0), 0, -Math.sin(y0)]); set3('uPhotoUp', [0, 1, 0]);
        var aspect = photoTex.aspect || 1.5, ph = 2.2 * Math.tan(BH.derive(cfg, { w: W, h: H }).fovY / 2) * 1.15;
        if (U.uPhotoSize) gl.uniform2f(U.uPhotoSize, Math.max(ph * aspect, ph * W / H), Math.max(ph, ph * W / H / aspect));
      }
      for (var i = 0; i < hooks.length; i++) hooks[i](api, { t: t, discT: discT, derived: d, cfg: cfg, camera: c });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function adapt(now, dt) {
      if (cfg.quality !== 'auto') return;
      ema = ema * 0.93 + dt * 1000 * 0.07;
      if (now - lastAdapt < 1000) return;
      if (ema > 21 && rs > 0.35) { rs = Math.max(0.35, rs - 0.05); holdUp = now + 10000; lastAdapt = now; resize(); }
      else if (ema < 17.5 && rs < 0.75 && now > holdUp) { rs = Math.min(0.75, rs + 0.05); lastAdapt = now; resize(); }
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (last && now - last < 14) return; // cap at ~60fps: a 120Hz screen doesn't need twice the work
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      draw();
      adapt(now, dt);
      frameN++; frameAcc += dt;
      if (frameAcc > 0.5) { fps = frameN / frameAcc; frameN = 0; frameAcc = 0; }
    }
    function step(dt) {
      t += dt;
      discT += dt * cfg.pace / d.scale * (d.mobile ? 1.35 : 1);
      if (cfg.view.drift) drift += dt * 1.2;
    }

    function start() {
      if (running || reduce || !visible || !api.ok || (typeof document !== 'undefined' && document.hidden)) return;
      running = true; last = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    api.setConfig = function (next) {
      var prev = cfg;
      cfg = BH.normalize(next);
      if (prev.view.yaw !== cfg.view.yaw || prev.view.tilt !== cfg.view.tilt) { view.yaw = cfg.view.yaw; view.tilt = cfg.view.tilt; }
      if (prev.quality !== cfg.quality) rs = SCALES[cfg.quality] || 0.5;
      if (!gl) return;
      if (prev.universe.photo !== cfg.universe.photo) loadPhotoUrl(cfg.universe.photo);
      build();
      resize();
      if (!running) { draw(); start(); }
    };
    api.setView = function (v) { if (v.yaw != null) view.yaw = v.yaw; if (v.tilt != null) view.tilt = Math.max(0, Math.min(89, v.tilt)); if (!running) draw(); };
    api.getView = function () { return { yaw: view.yaw + drift, tilt: view.tilt }; };
    api.resetDrift = function () { drift = 0; };
    api.setPhoto = function (img, kind) {
      if (!gl) return;
      if (!img) { photoTex = null; build(); return; }
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      tex.aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
      photoTex = tex;
      build();
      if (!running) draw();
    };
    var photoUrlLoaded = null;
    function loadPhotoUrl(url) {
      if (!url) { photoTex = null; photoUrlLoaded = null; build(); return; }
      if (url === photoUrlLoaded) return;
      photoUrlLoaded = url; photoTex = null;
      var img = new Image();
      if (/^https?:/.test(url)) img.crossOrigin = 'anonymous';
      img.onload = function () { if (photoUrlLoaded === url) api.setPhoto(img, cfg.universe.photoKind); };
      img.onerror = function () {
        if (photoUrlLoaded !== url) return;
        if (opts.onPhotoError) opts.onPhotoError(url); else if (typeof console !== 'undefined') console.warn('[black hole] could not load the photo — keeping the stars.');
      };
      img.src = url;
    }
    api.resize = function () { resize(); if (!running) draw(); };
    api.start = start;
    api.stop = stop;
    api.render = function () { draw(); };
    api.stats = function () { return { fps: Math.round(fps), renderScale: rs, steps: (BH.features(cfg).quality), running: running, size: [canvas.width, canvas.height] }; };
    api.config = function () { return cfg; };
    api.destroy = function () { stop(); if (io) io.disconnect(); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.remove(); };

    // ---------- lifecycle ----------
    function onVis() { document.hidden ? stop() : start(); }
    var io = null, ro = null;
    if (!gl) { fail('WebGL is not available'); api.destroy = function () {}; return api; }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); api.ok = false; });
    canvas.addEventListener('webglcontextrestored', function () { prog = null; progKey = ''; quad = null; photoTex = null; photoUrlLoaded = null; if (build()) { loadPhotoUrl(cfg.universe.photo); resize(); draw(); start(); } });
    document.addEventListener('visibilitychange', onVis);
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? start() : stop(); });
      io.observe(root);
    }
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { resize(); if (!running) { draw(); start(); } });
      ro.observe(root);
    }
    if (!build()) return api;
    loadPhotoUrl(cfg.universe.photo);
    resize();
    if (reduce) { step(1 / 60); }
    draw();
    start();
    return api;
  };
});
