// Builds exported pages from the real export code, for checking in a browser:
//   node tests/fixtures/build-fixtures.js  → tests/fixtures/out/*.html
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const BH = require('../../src/config.js');
['physics', 'shader', 'engine', 'editor', 'export'].forEach((m) => require('../../src/' + m + '.js'));

function checkerPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const on = ((x >> 5) + (y >> 5)) % 2, o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = on ? 216 : 107; raw[o + 1] = on ? 201 : 74; raw[o + 2] = on ? 168 : 46;
    }
  }
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'default.html'), BH.buildStandaloneHtml(BH.DEFAULTS, null));
const photo = checkerPng(480, 320);
const full = BH.normalize({ universe: { mode: 'photo', photo }, toys: { teddy: true, objects: [{ skin: 'cereal', orbit: 0.3, tilt: 30, phase: 100 }, { skin: 'metal', orbit: 0.6, tilt: -25, phase: 250 }] } });
fs.writeFileSync(path.join(out, 'full.html'), BH.buildStandaloneHtml(full, { dataUrl: photo }));
const snip = BH.buildSnippet(BH.DEFAULTS, null);
fs.writeFileSync(path.join(out, 'two-blocks.html'), `<!doctype html><html><head><meta charset="utf-8"><title>two blocks</title>
<style>body{margin:0;background:#111;color:#eee;font:14px sans-serif}.blk{position:relative;overflow:hidden;margin:8px}</style></head><body>
<div class="blk" style="height:300px">${snip}</div>
<div class="blk" id="late" style="height:0">${snip}</div>
<script>setTimeout(function(){document.getElementById('late').style.height='300px'},1000)</script>
</body></html>`);
console.log(fs.readdirSync(out).map((f) => f + ' ' + fs.statSync(path.join(out, f)).size).join('\n'));
