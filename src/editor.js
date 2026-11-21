(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('editor', false, function (BH) {
  function when(path, value) { return function (c) { return get(c, path) === value; }; }
  function get(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function setIn(o, path, v) {
    var ks = path.split('.'), c = o;
    for (var i = 0; i < ks.length - 1; i++) c = c[ks[i]];
    c[ks[ks.length - 1]] = v;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // The panel, in plain words. Hints explain the real thing for the curious.
  BH.CONTROLS = [
    { group: 'Black hole', key: 'mass', label: 'How heavy', type: 'slider', min: 0, max: 1, step: 0.01, hint: 'Heavier holes look bigger and turn more slowly.',
      liveHint: function (c) { return 'As heavy as ' + plainNumber(BH.massSuns(c.mass)) + ' Suns. Heavier holes look bigger and turn more slowly.'; } },
    { group: 'Black hole', key: 'glow', label: 'One-side glow', type: 'slider', min: 0, max: 1, step: 0.01, hint: 'Gas racing toward you looks brighter. Real black holes do this.' },

    { group: 'Disc', key: 'disc.amount', label: 'How hungry', type: 'slider', min: 0, max: 1, step: 0.01, hint: 'How much glowing gas is swirling in.' },
    { group: 'Disc', key: 'disc.brightness', label: 'Brightness', type: 'slider', min: 0, max: 2, step: 0.01 },
    { group: 'Disc', key: 'disc.width', label: 'Width', type: 'slider', min: 0, max: 1, step: 0.01 },
    { group: 'Disc', key: 'disc.colorMode', label: 'Colour', type: 'select', options: [['true', 'True colours'], ['custom', 'My colours']] },
    { group: 'Disc', key: 'disc.colorA', label: 'Inner colour', type: 'color', showIf: when('disc.colorMode', 'custom') },
    { group: 'Disc', key: 'disc.colorB', label: 'Outer colour', type: 'color', showIf: when('disc.colorMode', 'custom') },
    { group: 'Disc', key: 'disc.turbulence', label: 'Swirl', type: 'slider', min: 0, max: 1, step: 0.01 },

    { group: 'View', key: 'view.closer', label: 'Come closer', type: 'slider', min: 0, max: 1, step: 0.01, hint: 'Never closer than a safe orbit.' },
    { group: 'View', key: 'view.tilt', label: 'Tilt', type: 'slider', min: 0, max: 89, step: 1, hint: 'From above ↔ from the side. You can also drag the picture.' },
    { group: 'View', key: 'view.drift', label: 'Drift slowly around', type: 'toggle' },
    { group: 'View', key: 'view.zoom', label: 'Zoom', type: 'slider', min: 0.5, max: 4, step: 0.01, fmt: function (v) { return '×' + v.toFixed(1); },
      hint: 'A camera lens, not a step closer. Pinch or scroll to zoom, two fingers (or Shift-drag) to move it around.' },
    { group: 'View', key: 'view.x', label: 'Position: across', type: 'slider', min: -0.5, max: 1.5, step: 0.01 },
    { group: 'View', key: 'view.y', label: 'Position: up / down', type: 'slider', min: -0.5, max: 1.5, step: 0.01 },

    { group: 'Time', key: 'time', label: 'Speed of time', type: 'slider', min: -1, max: 12, step: 0.05, fmt: function (v) { return BH.timeLabel(v); },
      liveHint: function (c, e) { var i = e && e.timeInfo && e.timeInfo(); return i ? '1 second here = ' + BH.plainDuration(i.realPerSecond) + ' there.' : ''; } },

    { group: 'Universe', key: 'universe.mode', label: 'Sky', type: 'select', options: [['stars', 'Stars'], ['plain', 'Plain colour'], ['photo', 'My photo']] },
    { group: 'Universe', key: 'universe.stars', label: 'Stars', type: 'slider', min: 0, max: 1, step: 0.01, showIf: when('universe.mode', 'stars') },
    { group: 'Universe', key: 'universe.galaxy', label: 'Milky band', type: 'slider', min: 0, max: 1, step: 0.01, showIf: when('universe.mode', 'stars') },
    { group: 'Universe', key: 'universe.nebula', label: 'Nebula', type: 'slider', min: 0, max: 1, step: 0.01, showIf: when('universe.mode', 'stars') },
    { group: 'Universe', key: 'universe.nebulaA', label: 'Nebula colour 1', type: 'color', showIf: when('universe.mode', 'stars') },
    { group: 'Universe', key: 'universe.nebulaB', label: 'Nebula colour 2', type: 'color', showIf: when('universe.mode', 'stars') },
    { group: 'Universe', key: 'universe.plain', label: 'Colour', type: 'color', showIf: when('universe.mode', 'plain') },
    { group: 'Universe', action: 'upload', label: 'Upload photo', type: 'button', showIf: when('universe.mode', 'photo'), hint: 'Your dinner table, your street, your cat. It stays on your computer.' },
    { group: 'Universe', action: 'link', label: '…or image link', type: 'button', showIf: when('universe.mode', 'photo') },
    { group: 'Universe', key: 'universe.photoSize', label: 'Photo size in the snippet', type: 'select', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], showIf: when('universe.mode', 'photo') },

    { group: 'Toys', key: 'toys.teddy', label: 'Teddy', type: 'toggle', hint: 'Seen from far away, nothing ever quite falls in. It slows, stretches, reddens and fades at the edge. Slow time down to watch the last moment.' },

    { group: 'Quality', key: 'quality', label: 'Quality', type: 'select', options: [['auto', 'Auto'], ['lighter', 'Lighter'], ['sharper', 'Sharper']] },
  ];

  function plainNumber(n) {
    if (n < 1e4) return Math.round(n).toLocaleString('en');
    var w = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
    for (var i = 0; i < w.length; i++) if (n >= w[i][0]) { var v = n / w[i][0]; return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) + ' ' + w[i][1]; }
    return String(Math.round(n));
  }
  BH.plainNumber = plainNumber;
  // ×0.1 … ×1 trillion, in words
  BH.timeLabel = function (v) {
    var x = Math.pow(10, v);
    if (x < 0.95) return '×' + (Math.round(x * 10) / 10);
    if (x < 1e6) { var r = x < 10 ? Math.round(x * 10) / 10 : Math.round(x / Math.pow(10, Math.floor(Math.log10(x)) - 1)) * Math.pow(10, Math.floor(Math.log10(x)) - 1); return '×' + r.toLocaleString('en'); }
    var w = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
    for (var i = 0; i < w.length; i++) if (x >= w[i][0] * 0.95) return '×' + Math.round(x / w[i][0]) + ' ' + w[i][1];
  };
  BH.SKIN_CHOICES = [['rocky', 'Rocky'], ['bubbly', 'Bubbly'], ['cereal', 'Cereal'], ['metal', 'Metal']];

  var PHOTO_SIZES = { small: [800, 0.7], medium: [1200, 0.8], large: [1600, 0.85] };

  // Shrinks a photo to a JPEG data URL. Rejects with a friendly message.
  BH.downscalePhoto = function (file, size) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.size) return reject(new Error('That file is empty.'));
      if (file.size > 60e6) return reject(new Error('That file is too big (over 60 MB).'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return reject(new Error("Couldn't read that image. Try a JPG or PNG."));
        var p = PHOTO_SIZES[size] || PHOTO_SIZES.medium, k = Math.min(1, p[0] / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var dataUrl = cv.toDataURL('image/jpeg', p[1]), aspect = w / h;
        resolve({ dataUrl: dataUrl, bytes: Math.round((dataUrl.length - 23) * 0.75), w: cv.width, h: cv.height, kind: aspect >= 1.9 && aspect <= 2.1 ? 'pano' : 'flat' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a JPG or PNG.")); };
      img.src = url;
    });
  };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function kb(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB'; }

  BH.bootEditor = function (stage, panel) {
    var target = BH.decodeHash(location.hash), shown = clone(target);
    var engine = BH.createEngine(stage, shown, { interactive: true, mobileAuto: true, onPhotoError: function () { say("Couldn't load that image link (the site may block it). Try uploading the file instead."); } });
    var photoFile = null, lastPhoto = null, rows = [], toyHooks = [];
    BH.editor = { engine: engine, get: function () { return target; }, set: set, onRender: function (f) { toyHooks.push(f); }, say: say, refreshHooks: [] };

    // ---------- smoothing: approaching and resets are always gradual ----------
    var SLOW = { 'view.closer': 0.5 }, anim = 0, lastT = 0;
    function numericPaths(o, pre, out) {
      for (var k in o) {
        var p = pre ? pre + '.' + k : k;
        if (typeof o[k] === 'number') out.push(p);
        else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) numericPaths(o[k], p, out);
      }
      return out;
    }
    var PATHS = numericPaths(BH.DEFAULTS, '', []);
    function tick(now) {
      var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016; lastT = now;
      var moving = false, next = clone(target);
      PATHS.forEach(function (p) {
        var a = get(shown, p), b = get(target, p), tau = SLOW[p] || 0.09;
        if (p === 'view.yaw') b = a + (((b - a) % 360 + 540) % 360 - 180);
        var v = Math.abs(b - a) < 1e-4 ? b : a + (b - a) * (1 - Math.exp(-dt / tau));
        if (v !== b) moving = true;
        setIn(next, p, v);
      });
      shown = next;
      engine.setConfig(shown);
      anim = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) lastT = 0;
    }
    function kick() { if (!anim) anim = requestAnimationFrame(tick); }

    var hashTimer = 0;
    function set(path, v, opts) {
      var next = clone(target);
      if (path) setIn(next, path, v);
      target = BH.normalize(next);
      if (opts && opts.instant) { shown = clone(target); engine.setConfig(shown); }
      kick();
      refresh();
      clearTimeout(hashTimer);
      hashTimer = setTimeout(function () { history.replaceState(null, '', BH.encodeHash(target) || location.pathname); }, 200);
    }
    BH.editor.setAll = function (cfg, opts) { target = BH.normalize(cfg); if (opts && opts.instant) shown = clone(target); kick(); refresh(); };

    // ---------- panel ----------
    var msg = el('div', { class: 'bh-msg', role: 'status' });
    function say(t) { msg.textContent = t || ''; msg.style.display = t ? 'block' : 'none'; }
    var fileIn = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    fileIn.addEventListener('change', function () { if (fileIn.files[0]) usePhoto(fileIn.files[0]); fileIn.value = ''; });
    var photoInfo = el('div', { class: 'bh-hint' });

    function usePhoto(file) {
      say('Shrinking your photo…');
      BH.downscalePhoto(file, target.universe.photoSize).then(function (r) {
        photoFile = file; lastPhoto = r;
        photoInfo.textContent = r.w + '×' + r.h + ', ' + kb(r.bytes) + (r.kind === 'pano' ? ', wrapped all around (360° photo)' : '');
        say('');
        var u = clone(target.universe); u.mode = 'photo'; u.photo = r.dataUrl; u.photoKind = r.kind;
        set('universe', u);
      }, function (e) { say(e.message); });
    }

    var groups = {}, body = el('div', { class: 'bh-body' });
    BH.CONTROLS.forEach(function (c) {
      if (!groups[c.group]) {
        var sec = el('details', { class: 'bh-group', open: '' }, [el('summary', { text: c.group })]);
        groups[c.group] = sec; body.appendChild(sec);
      }
      var row = el('div', { class: 'bh-row' }), input, out = null;
      if (c.type === 'slider') {
        out = el('span', { class: 'bh-val' });
        input = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, 'aria-label': c.label });
        input.addEventListener('input', function () { set(c.key, parseFloat(input.value)); });
        row.appendChild(el('label', { class: 'bh-label' }, [el('span', { text: c.label }), out]));
        row.appendChild(input);
      } else if (c.type === 'toggle') {
        input = el('input', { type: 'checkbox' });
        input.addEventListener('change', function () { set(c.key, input.checked); });
        row.appendChild(el('label', { class: 'bh-label bh-check' }, [input, el('span', { text: c.label })]));
      } else if (c.type === 'color') {
        input = el('input', { type: 'color', 'aria-label': c.label });
        input.addEventListener('input', function () { set(c.key, input.value); });
        row.appendChild(el('label', { class: 'bh-label bh-inline' }, [el('span', { text: c.label }), input]));
      } else if (c.type === 'select') {
        input = el('div', { class: 'bh-seg', role: 'radiogroup', 'aria-label': c.label });
        c.options.forEach(function (o) {
          input.appendChild(el('button', { type: 'button', 'data-v': o[0], text: o[1], onclick: function () {
            if (c.key === 'universe.mode' && o[0] === 'photo' && !target.universe.photo && lastPhoto) {
              var u = clone(target.universe); u.mode = 'photo'; u.photo = lastPhoto.dataUrl; u.photoKind = lastPhoto.kind; return set('universe', u);
            }
            if (c.key === 'universe.photoSize' && photoFile && /^data:/.test(target.universe.photo || '')) { set(c.key, o[0]); return usePhoto(photoFile); }
            set(c.key, o[0]);
          } }));
        });
        row.appendChild(el('div', { class: 'bh-label', text: c.label }));
        row.appendChild(input);
      } else if (c.action === 'upload') {
        row.appendChild(el('button', { type: 'button', class: 'bh-btn', text: c.label, onclick: function () { fileIn.click(); } }));
        row.appendChild(photoInfo);
      } else if (c.action === 'link') {
        var link = el('input', { type: 'url', placeholder: 'https://… image link', class: 'bh-text', 'aria-label': 'Image link' });
        link.addEventListener('change', function () {
          var v = link.value.trim();
          if (!/^https?:\/\//.test(v)) { if (v) say('That link should start with https://'); return; }
          say(''); photoFile = null; lastPhoto = null; // the link replaces any uploaded photo
          var u = clone(target.universe); u.mode = 'photo'; u.photo = v; u.photoKind = 'flat'; set('universe', u);
        });
        row.appendChild(el('div', { class: 'bh-label', text: c.label }));
        row.appendChild(link);
      }
      var hintEl = c.hint || c.liveHint ? el('div', { class: 'bh-hint', text: c.hint || '' }) : null;
      if (hintEl) row.appendChild(hintEl);
      groups[c.group].appendChild(row);
      rows.push({ c: c, row: row, input: input, out: out, hint: hintEl });
    });
    BH.editor.groups = groups; BH.editor.body = body;

    // ---------- toys: launch objects into orbit ----------
    if (!groups.Toys) { groups.Toys = el('details', { class: 'bh-group', open: '' }, [el('summary', { text: 'Toys' })]); body.insertBefore(groups.Toys, groups.Quality); }
    var launch = { shape: 'orb', skin: 'cereal', orbit: 0.5 };
    var SHAPES = [['orb', 'Orb'], ['star', 'Star'], ['torus', 'Ring']], SKINS = BH.SKIN_CHOICES;
    BH.editor.shapesReady = { orb: true, star: true, torus: true };
    function seg(opts, key) {
      var box = el('div', { class: 'bh-seg' });
      opts.forEach(function (o) {
        box.appendChild(el('button', { type: 'button', 'data-v': o[0], text: o[1], onclick: function () { launch[key] = o[0]; paintLauncher(); } }));
      });
      return box;
    }
    var shapeSeg = seg(SHAPES, 'shape'), skinSeg = seg(SKINS, 'skin');
    var orbitIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.5, 'aria-label': 'Orbit size' });
    orbitIn.addEventListener('input', function () { launch.orbit = parseFloat(orbitIn.value); });
    var launchBtn = el('button', { type: 'button', class: 'bh-btn bh-launch', text: 'Launch into orbit', onclick: function () {
      var objs = clone(target.toys.objects);
      if (objs.length >= BH.MAX_OBJECTS || !BH.editor.shapesReady[launch.shape]) return;
      objs.push({ shape: launch.shape, skin: launch.skin, orbit: launch.orbit, tilt: (Math.random() < 0.5 ? -1 : 1) * Math.round(20 + Math.random() * 20), phase: Math.round(Math.random() * 360) });
      set('toys.objects', objs);
    } });
    var list = el('div', { class: 'bh-objs' });
    groups.Toys.appendChild(el('div', { class: 'bh-row' }, [el('div', { class: 'bh-label', text: 'Launch an object' }), shapeSeg, el('div', { style: 'height:6px' }), skinSeg]));
    groups.Toys.appendChild(el('div', { class: 'bh-row' }, [el('div', { class: 'bh-label', text: 'Orbit size' }), orbitIn]));
    groups.Toys.appendChild(el('div', { class: 'bh-row' }, [launchBtn, el('div', { class: 'bh-hint', text: 'Up to 3 at once. Watch one pass behind the hole: you see it twice.' })]));
    groups.Toys.appendChild(list);
    function paintLauncher() {
      [[shapeSeg, 'shape'], [skinSeg, 'skin']].forEach(function (p) {
        Array.prototype.forEach.call(p[0].children, function (b) {
          var v = b.getAttribute('data-v');
          b.setAttribute('aria-pressed', launch[p[1]] === v ? 'true' : 'false');
          if (p[1] === 'shape') { var ok = BH.editor.shapesReady[v]; b.disabled = !ok; b.title = ok ? '' : 'Coming soon'; }
        });
      });
      var full = target.toys.objects.length >= BH.MAX_OBJECTS;
      launchBtn.disabled = full;
      launchBtn.textContent = full ? 'Orbit is full (3)' : 'Launch into orbit';
      list.innerHTML = '';
      target.toys.objects.forEach(function (o, i) {
        var name = SKINS.filter(function (s) { return s[0] === o.skin; })[0][1] + ' ' + SHAPES.filter(function (s) { return s[0] === o.shape; })[0][1].toLowerCase();
        list.appendChild(el('div', { class: 'bh-obj' }, [el('span', { text: name }), el('button', { type: 'button', class: 'bh-x', 'aria-label': 'Remove ' + name, text: '×', onclick: function () {
          var objs = clone(target.toys.objects); objs.splice(i, 1); set('toys.objects', objs);
        } })]));
      });
    }
    BH.editor.refreshHooks.push(paintLauncher);

    function refresh() {
      rows.forEach(function (r) {
        var c = r.c;
        r.row.style.display = c.showIf && !c.showIf(target) ? 'none' : '';
        if (!c.key) return;
        var v = get(target, c.key);
        if (r.c.liveHint && r.hint) r.hint.textContent = r.c.liveHint(target, engine);
        if (c.type === 'slider') { if (document.activeElement !== r.input) r.input.value = v; r.out.textContent = c.fmt ? c.fmt(v) : c.max > 2 ? Math.round(v) + '°' : c.max === 2 ? v.toFixed(2).replace(/0$/, '') + '×' : Math.round(v * 100) + '%'; }
        else if (c.type === 'toggle') r.input.checked = v;
        else if (c.type === 'color') r.input.value = v;
        else if (c.type === 'select') Array.prototype.forEach.call(r.input.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === v ? 'true' : 'false'); });
      });
      BH.editor.refreshHooks && BH.editor.refreshHooks.forEach(function (f) { f(target); });
    }
    BH.editor.refresh = refresh;

    var fpsOut = el('span', { class: 'bh-fps' });
    setInterval(function () { var s = engine.stats(); fpsOut.textContent = s.running ? s.fps + ' fps · ' + Math.round(s.renderScale * 100) + '% detail' : 'paused'; }, 1000);
    groups.Quality.appendChild(el('div', { class: 'bh-row' }, [fpsOut]));

    var actions = el('div', { class: 'bh-actions' }, [
      el('button', { type: 'button', class: 'bh-btn bh-calm', text: 'Back to calm', onclick: function () {
        var v = engine.getView(); engine.resetDrift();
        shown.view.yaw = v.yaw;
        target = BH.normalize({ universe: { photoSize: target.universe.photoSize } });
        set(null);
      } }),
      el('button', { type: 'button', class: 'bh-btn bh-primary', text: 'Copy snippet', 'data-act': 'copy' }),
      el('button', { type: 'button', class: 'bh-btn', text: 'Download .html', 'data-act': 'download' }),
    ]);
    BH.editor.actions = actions;
    function exportPhoto() {
      var ph = target.universe.photo;
      if (target.universe.mode !== 'photo' || !ph) return null;
      return /^data:/.test(ph) ? { dataUrl: ph } : { url: ph };
    }
    function sizeNote(text) {
      var n = BH.snippetBytes(text);
      return kb(n) + (n > 400e3 ? '. That\'s heavy for a web page: try a smaller photo size or an image link.' : '');
    }
    actions.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act || !BH.buildSnippet) return;
      if (act === 'copy') {
        var snip = BH.buildSnippet(target, exportPhoto());
        var done = function () { say('Snippet copied (' + sizeNote(snip) + '). Paste it into a Tilda Zero Block HTML element.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(snip).then(done, function () { fallbackCopy(snip); done(); });
        else { fallbackCopy(snip); done(); }
      } else if (act === 'download') {
        var html = BH.buildStandaloneHtml(target, exportPhoto());
        var a = el('a', { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'black-hole.html' });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        say('Downloaded black-hole.html (' + sizeNote(html) + ').');
      }
    });
    function fallbackCopy(text) {
      var ta = el('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (err) { /* nothing else to try */ } ta.remove();
    }
    var toggle = el('button', { type: 'button', class: 'bh-toggle', 'aria-label': 'Show or hide controls', text: '☰', onclick: function () { panel.classList.toggle('bh-collapsed'); } });
    panel.appendChild(toggle);
    panel.appendChild(el('div', { class: 'bh-inner' }, [el('h1', { text: 'Black hole' }), msg, body, actions, fileIn]));
    say('');
    refresh();

    // ---------- gestures: drag turns it, pinch/wheel zooms, two fingers or Shift-drag move it ----------
    function vp() { return { w: stage.clientWidth || 1, h: stage.clientHeight || 1 }; }
    function commitView(next) { target = BH.normalize(next); kick(); refresh(); clearTimeout(hashTimer); hashTimer = setTimeout(function () { history.replaceState(null, '', BH.encodeHash(target) || location.pathname); }, 200); }
    // zoom by factor k around a screen point, so what's under your fingers stays put
    function zoomAt(k, cx, cy) {
      var v = vp(), next = clone(target);
      next.view.zoom = Math.max(0.5, Math.min(4, target.view.zoom * k));
      var t1 = Math.tan(BH.derive(target, v).fovY / 2), t2 = Math.tan(BH.derive(BH.normalize(next), v).fovY / 2), m = t1 / t2;
      var hx = target.view.x * v.w, hy = target.view.y * v.h;
      next.view.x = (cx - (cx - hx) * m) / v.w; next.view.y = (cy - (cy - hy) * m) / v.h;
      commitView(next);
    }
    function panBy(dx, dy) { var v = vp(), next = clone(target); next.view.x += dx / v.w; next.view.y += dy / v.h; commitView(next); }
    function local(e) { var b = stage.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }

    var lastPad = 0;
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = local(e), now = Date.now(), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      if (e.ctrlKey) return zoomAt(Math.exp(-dy * 0.01), p[0], p[1]); // touchpad pinch (and Ctrl+wheel)
      // a touchpad scrolls sideways too and in small uneven steps; a mouse wheel clicks in big even ones
      if (dx !== 0 || (e.deltaMode === 0 && Math.abs(dy) < 40 && dy % 1 !== 0)) lastPad = now;
      if (now - lastPad < 800) panBy(-dx, -dy);
      else zoomAt(Math.exp(-dy * 0.0015), p[0], p[1]);
    }, { passive: false });
    var gScale = 1; // Safari's own pinch events
    stage.addEventListener('gesturestart', function (e) { e.preventDefault(); gScale = 1; });
    stage.addEventListener('gesturechange', function (e) { e.preventDefault(); var p = local(e); zoomAt(e.scale / gScale, p[0], p[1]); gScale = e.scale; });

    var pts = {}, drag = null, pinch = null;
    function two() { var k = Object.keys(pts); return k.length === 2 ? [pts[k[0]], pts[k[1]]] : null; }
    stage.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = local(e); stage.setPointerCapture(e.pointerId); stage.classList.add('bh-grab');
      var t2 = two();
      if (t2) { drag = null; pinch = { d: Math.hypot(t2[0][0] - t2[1][0], t2[0][1] - t2[1][1]), c: [(t2[0][0] + t2[1][0]) / 2, (t2[0][1] + t2[1][1]) / 2] }; return; }
      drag = { x: e.clientX, y: e.clientY, yaw: target.view.yaw, tilt: target.view.tilt, pan: e.shiftKey || e.altKey || e.button === 1, last: local(e) };
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = local(e);
      var t2 = two();
      if (pinch && t2) {
        var dd = Math.hypot(t2[0][0] - t2[1][0], t2[0][1] - t2[1][1]), c = [(t2[0][0] + t2[1][0]) / 2, (t2[0][1] + t2[1][1]) / 2];
        panBy(c[0] - pinch.c[0], c[1] - pinch.c[1]);
        if (pinch.d > 0) zoomAt(dd / pinch.d, c[0], c[1]);
        pinch = { d: dd, c: c };
        return;
      }
      if (!drag) return;
      if (drag.pan) { var p = local(e); panBy(p[0] - drag.last[0], p[1] - drag.last[1]); drag.last = p; return; }
      var k = 180 / Math.max(stage.clientHeight, 1);
      var next = clone(target);
      next.view.yaw = drag.yaw - (e.clientX - drag.x) * k;
      next.view.tilt = Math.max(0, Math.min(89, drag.tilt - (e.clientY - drag.y) * k * 0.6));
      target = BH.normalize(next); kick(); refresh();
    });
    function endDrag(e) {
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) pinch = null;
      if (Object.keys(pts).length) return;
      if (!drag && !pinch) { stage.classList.remove('bh-grab'); set(null); return; }
      drag = null; stage.classList.remove('bh-grab'); set(null);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // ---------- time read-out: what has happened "there" while time runs fast or slow ----------
    var clock = el('div', { class: 'bh-clock', 'aria-live': 'polite' });
    document.body.appendChild(clock);
    var since = null; // where the clock stood when you left ×1
    var TOY_KG = { rocky: 1, bubbly: 1e-4, cereal: 1e-3, metal: 1 };
    function toyName(o) { return (SKINS.filter(function (s) { return s[0] === o.skin; })[0] || ['', ''])[1].toLowerCase() + ' ' + (SHAPES.filter(function (s) { return s[0] === o.shape; })[0] || ['', ''])[1].toLowerCase(); }
    function paintClock() {
      var c = target, info = engine.timeInfo && engine.timeInfo();
      if (!info || Math.abs(c.time) < 0.02) { since = null; clock.style.display = 'none'; return; }
      if (!since) since = { real: info.real, discT: info.discT };
      var lines = [['Time passed there', BH.plainDuration(info.real - since.real)]];
      c.toys.objects.forEach(function (o) {
        var R = BH.toyOrbitRadius(o.orbit), turns = BH.discOmega(R, 1, 1) * (info.discT - since.discT) / (2 * Math.PI);
        var y = BH.inspiralYears(BH.massSuns(c.mass), R, TOY_KG[o.skin] || 1);
        lines.push([cap(toyName(o)), (turns < 1 ? 'less than one lap' : plainNumber(Math.floor(turns)) + (Math.floor(turns) === 1 ? ' lap' : ' laps')) + '. Still going round: to spiral in it would need ' + BH.plainDuration(y * 3.15576e7) + ' (the universe is 14 billion years old).']);
      });
      if (c.toys.teddy) {
        var own = BH.plainDuration(BH.teddyOwnWatch(9.5) * 9.85e-6 * BH.massSuns(c.mass));
        var ts = engine.teddyState ? engine.teddyState() : { done: false };
        lines.push(['Teddy', ts.done ? 'From here it never crosses: it froze at the edge and faded, and stays that way. On its own watch it fell in after ' + own + '.' : 'Falling. Its own watch will say ' + own + ' when it crosses; from here, never.']);
      }
      clock.style.display = '';
      clock.innerHTML = '';
      lines.forEach(function (l) { clock.appendChild(el('div', {}, [el('b', { text: l[0] + ': ' }), el('span', { text: l[1] })])); });
    }
    function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
    setInterval(function () { paintClock(); rows.forEach(function (r) { if (r.c.key === 'time' && r.hint) r.hint.textContent = r.c.liveHint(target, engine); }); }, 250);
    window.addEventListener('hashchange', function () { var c = BH.decodeHash(location.hash); if (JSON.stringify(c) !== JSON.stringify(BH.normalize(Object.assign({}, target, { universe: Object.assign({}, target.universe, { photo: /^data:/.test(target.universe.photo || '') ? null : target.universe.photo }) })))) BH.editor.setAll(c); });
    return BH.editor;
  };
});
