const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const BH = require('../src/config.js');
['physics', 'shader', 'engine', 'editor', 'export'].forEach((m) => require('../src/' + m + '.js'));

const scriptOf = (snippet) => /<script>([\s\S]*)<\/script>/.exec(snippet)[1];

test('default snippet has the Tilda shape and no editor code', () => {
  const s = BH.buildSnippet(BH.DEFAULTS, null);
  assert.match(s, /^<!--[^]*?-->\s*<div class="bh-bg"/);
  assert.match(s, /<style>[^<]*pointer-events:\s*none/);
  assert.match(s, /var CONFIG = \{/);
  for (const banned of ['bootEditor', 'CONTROLS', 'buildSnippet', 'downscalePhoto']) assert.ok(!s.includes(banned), banned);
  assert.equal((s.match(/<\/script>/g) || []).length, 1);
});

test('photo by link is referenced, embedded photo appears once', () => {
  const url = 'https://example.com/t.jpg';
  const a = BH.buildSnippet(BH.normalize({ universe: { mode: 'photo', photo: url } }), { url });
  assert.ok(a.includes(url));
  assert.ok(!a.includes('data:image/jpeg;base64'));
  const data = 'data:image/jpeg;base64,' + 'A'.repeat(500);
  const b = BH.buildSnippet(BH.normalize({ universe: { mode: 'photo', photo: data } }), { dataUrl: data });
  assert.equal(b.split(data).length - 1, 1);
});

test('CONFIG in the snippet round-trips to the same settings', () => {
  const cfg = BH.normalize({ mass: 0.8, disc: { colorMode: 'custom', colorA: '#112233' }, toys: { teddy: true, objects: [{ skin: 'cereal' }] } });
  const ctx = { out: null };
  vm.runInNewContext(/var CONFIG = [\s\S]*?\n  \};/.exec(scriptOf(BH.buildSnippet(cfg, null)))[0] + '\nout = CONFIG;', ctx);
  assert.deepEqual(BH.normalize(JSON.parse(JSON.stringify(ctx.out))), cfg);
});

function fakeDom() {
  const mk = (w, h) => {
    const attrs = {}, kids = [];
    return { clientWidth: w, clientHeight: h, classList: { contains: (c) => c === 'bh-bg' }, style: {},
      setAttribute: (k, v) => (attrs[k] = v), hasAttribute: (k) => k in attrs, attrs,
      appendChild: (c) => kids.push(c), kids, previousElementSibling: null };
  };
  const roots = [mk(800, 600), mk(800, 0)];
  const observers = [];
  const document = {
    currentScript: null, hidden: false,
    createElement: () => ({ style: {}, getContext: () => null, addEventListener() {}, remove() {} }),
    querySelectorAll: () => roots.filter((r) => !r.hasAttribute('data-bh-on')),
    addEventListener() {}, removeEventListener() {},
  };
  const warns = [];
  const ctx = {
    document, console: { warn: (m) => warns.push(m), log() {} },
    ResizeObserver: function (cb) { this.observe = () => observers.push(cb); this.disconnect = () => {}; },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  };
  return { roots, observers, ctx, warns };
}

test('two snippets on one page each claim their own block, even one with no height yet', () => {
  const { roots, observers, ctx, warns } = fakeDom();
  const js = scriptOf(BH.buildSnippet(BH.DEFAULTS, null));
  vm.createContext(ctx);
  ctx.document.currentScript = { previousElementSibling: roots[0] };
  vm.runInContext(js, ctx);
  ctx.document.currentScript = { previousElementSibling: roots[1] };
  vm.runInContext(js, ctx);
  assert.ok(roots[0].hasAttribute('data-bh-on'));
  assert.ok(roots[1].hasAttribute('data-bh-on'));
  assert.equal(roots[1].kids.length, 0, 'zero-height block waits');
  roots[1].clientHeight = 400;
  observers.forEach((cb) => cb());
  assert.equal(roots[1].kids.length, 1, 'starts once it has a size');
  assert.equal('BH' in ctx, false);
  assert.ok(warns.length >= 1); // no WebGL in the stub: plain background path
});
