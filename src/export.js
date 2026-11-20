(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('export', false, function (BH) {
  var EXTRA = {
    'view.yaw': 'Turned around, in degrees',
    'universe.photo': 'Your photo',
    'universe.photoKind': 'flat = a picture behind the hole, pano = a 360° photo wrapped all around',
    'toys.objects': 'Things in orbit: shape orb/star/torus, skin rocky/fluffy/cereal/metal, orbit 0–1, tilt and phase in degrees',
    'quality': 'auto / lighter / sharper',
  };
  function comments() {
    var c = {};
    (BH.CONTROLS || []).forEach(function (k) {
      if (!k.key) return;
      var txt = k.label;
      if (k.type === 'slider') txt += ' (' + k.min + '–' + k.max + ')';
      if (k.type === 'select') txt += ': ' + k.options.map(function (o) { return o[0]; }).join(' / ');
      if (k.hint) txt += '. ' + k.hint;
      c[k.key] = txt;
    });
    for (var e in EXTRA) if (!c[e]) c[e] = EXTRA[e];
    return c;
  }

  function literal(obj, indent, path, notes, photoVar) {
    var pad = new Array(indent + 3).join(' '), lines = [];
    var keys = Object.keys(obj);
    keys.forEach(function (k) {
      var p = path ? path + '.' + k : k, v = obj[k], note = notes[p] ? ' // ' + notes[p] : '';
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        lines.push(pad + k + ': {');
        lines = lines.concat(literal(v, indent + 2, p, notes, photoVar));
        lines.push(pad + '},');
      } else {
        var val = p === 'universe.photo' && v && photoVar ? photoVar : JSON.stringify(v);
        lines.push(pad + k + ': ' + val + ',' + note.replace(/\n/g, ' '));
      }
    });
    return lines;
  }

  BH.buildSnippet = function (cfg, photo) {
    cfg = BH.normalize(cfg);
    var c = JSON.parse(JSON.stringify(cfg));
    var usesPhoto = c.universe.mode === 'photo' && photo && (photo.dataUrl || photo.url);
    c.universe.photo = usesPhoto ? (photo.url || photo.dataUrl) : null;
    if (!usesPhoto && c.universe.mode === 'photo') c.universe.mode = 'stars';
    var photoVar = usesPhoto && photo.dataUrl ? 'PHOTO' : null;
    var mods = BH.modules.filter(function (m) { return m.runtime; }).map(function (m) {
      return '  // ---- ' + m.name + ' ----\n  (' + m.fn.toString() + ')(BH);';
    }).join('\n');
    var js = [
      '(function () {',
      photoVar ? '  var PHOTO = ' + JSON.stringify(c.universe.photo) + ';' : '',
      '  // Everything you picked in the generator. Change values here to fine-tune.',
      '  var CONFIG = {',
      literal(c, 2, '', comments(), photoVar).join('\n'),
      '  };',
      '  var BH = { modules: [] };',
      mods,
      '  // ---- start: find this snippet\'s own block, wait until it has a size ----',
      '  var s = document.currentScript, root = null;',
      '  for (var el = s && s.previousElementSibling; el; el = el.previousElementSibling) {',
      '    if (el.classList && el.classList.contains(\'bh-bg\') && !el.hasAttribute(\'data-bh-on\')) { root = el; break; }',
      '  }',
      '  if (!root) { var all = document.querySelectorAll(\'.bh-bg:not([data-bh-on])\'); root = all[all.length - 1]; }',
      '  if (!root) return;',
      '  root.setAttribute(\'data-bh-on\', \'\');',
      '  function boot() { try { BH.createEngine(root, CONFIG, { interactive: false, mobileAuto: true }); } catch (e) { root.style.background = CONFIG.universe.plain; } }',
      '  if (root.clientWidth && root.clientHeight) boot();',
      '  else if (typeof ResizeObserver === \'function\') {',
      '    var ro = new ResizeObserver(function () { if (root.clientWidth && root.clientHeight) { ro.disconnect(); boot(); } });',
      '    ro.observe(root);',
      '  } else boot();',
      '})();',
    ].filter(Boolean).join('\n');
    var bg = c.universe.mode === 'plain' ? c.universe.plain : '#05040b';
    return [
      '<!-- Black hole background, made with the Black Hole Generator. Paste the whole thing into a Tilda Zero Block HTML element (it fills its block). -->',
      '<div class="bh-bg" aria-hidden="true"></div>',
      '<style>.bh-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;background:' + bg + '}</style>',
      '<script>',
      js,
      '</script>',
    ].join('\n');
  };

  BH.buildStandaloneHtml = function (cfg, photo) {
    return [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Black hole</title>',
      '<style>html,body{margin:0;height:100%;background:#05040b}.bh-wrap{position:relative;height:100vh;overflow:hidden}</style>',
      '</head><body><div class="bh-wrap">',
      BH.buildSnippet(cfg, photo),
      '</div></body></html>',
    ].join('\n');
  };

  BH.snippetBytes = function (s) { return typeof Blob === 'function' ? new Blob([s]).size : s.length; };
});
