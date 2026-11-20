# Black Hole Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser playground that renders a lensed, Doppler-beamed Schwarzschild black hole with plain-language controls and toys, and exports a Tilda-ready HTML snippet.

**Architecture:** A per-pixel ray tracer in a WebGL1 fragment shader integrates each light ray in its orbital plane (u'' = −u + 1.5u², r_s = 1), then tests for disc crossings, toys, horizon capture or escape to the universe. Plain-JS modules (config, physics, shader builder, engine) are shared by the editor and the export. The export inlines the same module sources via `Function.prototype.toString`, so there is one engine and no build step.

**Tech Stack:** Vanilla JS (ES2020, classic scripts), WebGL1 + GLSL ES 1.00, Node 24 built-in test runner (`node --test`) for pure-JS logic, built-in browser pane for visual checks.

**Spec:** `docs/specs/2026-11-20-black-hole-generator-design.md`

## Global Constraints

- No build step, no server required: `index.html` opens directly from disk (`file://`). Scripts are classic `<script src>` (ES modules don't load over `file://`).
- **Deviation from spec, flagged to the author:** the spec says "one self-contained `index.html`". The editor is `index.html` + `src/*.js` files in one folder. The *exported snippet* stays fully self-contained. Reason: focused files are far more reliable to build and test, and the export needs module sources as functions anyway.
- No libraries. If one becomes unavoidable, load it from cdnjs with an exact pinned version.
- Controls use plain language. No "ISCO", "geodesic", "spin parameter", "Schwarzschild" in labels; these terms may appear only in an optional "the real thing" hint line.
- Calm default: camera at the far distance (30 r_s), tilt 80°, mass 0.5, beaming on (glow 0.8), toys off. Closest distance is 6 r_s and is never crossed.
- Snippet shape: `<div class="bh-bg" aria-hidden="true"></div><style>…</style><script>…</script>`. Root `position:absolute; inset:0; overflow:hidden; pointer-events:none`. DPR capped at 2. Pauses on IntersectionObserver / `visibilitychange`. Handles `webglcontextlost`/`restored`. `prefers-reduced-motion` → one still frame. No WebGL → plain background colour.
- Phones (root width < 768px): automatic framing, i.e. image scale ×1.35 and render scale 0.35. There are no separate phone settings.
- Photos never leave the machine. Embedded photo presets by longest side, JPEG: small 800px q0.7, medium 1200px q0.8, large 1600px q0.85. Or reference by URL.
- Every `src/*.js` file uses the module pattern in Task 1, so it runs in both Node and the browser.

## Review Focus

1. **Bad or stale URL hash** (hand-edited, from an older version, truncated): load the defaults merged with whatever valid fields remain. Never show a blank page. → Task 1 test.
2. **Extreme slider combinations** (closer = 1, mass = 1, width = 1, 3 toys): no NaN pixels, distance never < 6 r_s, toy orbits always outside the disc's outer edge + margin. → Task 1 and Task 2 tests.
3. **WebGL missing or shader compile failure** (old phone, mediump-only GPU): show the plain bg colour, log once, no exceptions bubbling to Tilda's page. → Task 3 test.
4. **Huge or odd photo uploads** (24 MP PNG, HEIC the browser can't decode, 0-byte file): downscale or show a friendly message, keep the previous universe. → Task 6 test.
5. **Snippet placed twice on one page, or in a block with 0 height at load**: each instance finds its own root and starts rendering when the block gets a size (ResizeObserver). → Task 9 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Editor page: layout, loads `src/*.js` in order, boots the editor |
| `src/config.js` | `DEFAULTS`, `normalize`, `encodeHash`, `decodeHash`, derived values (`derive`) |
| `src/physics.js` | CPU reference ray tracer, disc angular speed, Doppler factor, teddy infall, toy orbit positions |
| `src/shader.js` | `buildFragmentShader(features)`: GLSL assembled from chunks, with only the features in use |
| `src/engine.js` | `createEngine(root, cfg, opts)`: WebGL setup, uniforms, textures, loop, adaptive quality, visibility, fallback |
| `src/editor.js` | Control schema, panel UI, drag-rotate, hash sync, photo upload, toy launcher, "Back to calm" |
| `src/export.js` | `buildSnippet(cfg, photo)`: Tilda snippet and downloadable `.html` |
| `tests/*.test.js` | Node tests for config, physics, shader, export |
| `.claude/launch.json` | Static server for the browser pane (`python3 -m http.server 8123`) |

---

### Task 1: Project scaffold, module pattern, config

**Files:**
- Create: `package.json`, `.gitignore`, `.claude/launch.json`, `src/config.js`, `tests/config.test.js`, `index.html` (stub that loads `src/config.js` and prints `BH.DEFAULTS`)

**Interfaces:**
- Produces: global `BH` (browser: `globalThis.BH`; Node: `require('../src/config.js')` returns `BH`). `BH.modules: Array<{name: string, fn: Function, runtime: boolean}>`.
- Module pattern used by **every** `src/*.js`:
  ```js
  (function (name, runtime, fn) {
    var BH = (globalThis.BH = globalThis.BH || { modules: [] });
    BH.modules.push({ name: name, fn: fn, runtime: runtime });
    fn(BH);
    if (typeof module !== 'undefined') module.exports = BH;
  })('config', true, function (BH) { /* module body attaches to BH */ });
  ```
  `runtime: true` means the module ships in the snippet (`config`, `physics`, `shader`, `engine`). `editor` and `export` are `false`.
- Produces: `BH.DEFAULTS`, `BH.normalize(partial) -> Config`, `BH.encodeHash(cfg) -> string`, `BH.decodeHash(str) -> Config`, `BH.derive(cfg, viewport:{w,h}) -> {distance, scale, fovY, discOuter, mobile}`.
- Config shape (exact keys, defaults, ranges):
  ```
  mass 0.5 [0,1] · glow 0.8 [0,1] · pace 1 [0.25,2] · quality 'auto'|'lighter'|'sharper'
  disc: amount 0.6 [0,1], brightness 1 [0,2], width 0.5 [0,1], colorMode 'true'|'custom',
        colorA '#ffe2b0', colorB '#c8602a', turbulence 0.5 [0,1]
  view: closer 0 [0,1], tilt 80 [0,89] (deg; 0 = top-down, 89 ≈ edge-on), yaw 0 (deg, wraps),
        drift true, x 0.5 [0,1], y 0.5 [0,1]
  universe: mode 'stars'|'plain'|'photo', stars 0.7, galaxy 0.5, nebula 0.4 [0,1],
            nebulaA '#2C46C8', nebulaB '#6A35B8', plain '#0A0816',
            photo null|string (data URL or https URL), photoKind 'flat'|'pano', photoSize 'small'|'medium'|'large'
  toys: objects [] (max 3; each {shape 'orb'|'star'|'torus', skin 'rocky'|'fluffy'|'cereal'|'metal',
        orbit 0.5 [0,1], tilt 10 [-45,45] deg, phase [0,360) deg}), teddy false
  ```
- `derive`: `distance = 30 + (6 - 30) * smoothstep(0,1,closer)`; `scale = 2 ** ((mass - 0.5) * 2)` (×1.35 when `w < 768`); `fovY = 0.85 / scale` rad; `discOuter = 8 + 22 * width` (r_s). Toy orbit radius = `discOuter + 3 + orbit * 15`.
- `encodeHash`: `'#c=' + base64url(JSON of only the fields that differ from DEFAULTS)`. Photo data URLs are never put in the hash (an https photo URL is).

- [ ] **Step 1:** `git init`. Create `package.json` (`{"name":"black-hole-gen","private":true,"scripts":{"test":"node --test tests/"}}`), `.gitignore` (`node_modules/`, `.DS_Store`) and `.claude/launch.json` with config `{"name":"editor","runtimeExecutable":"python3","runtimeArgs":["-m","http.server","8123"],"port":8123}`.
- [ ] **Step 2: Write failing tests** in `tests/config.test.js`:
  - `normalize({})` deep-equals `DEFAULTS`.
  - `normalize({view:{closer:5, tilt:-10}, toys:{objects:[{},{},{},{}]}})`: closer 1, tilt 0, `objects.length === 3`, every object filled with defaults.
  - Unknown enum (`universe.mode:'banana'`) → default `'stars'`; bad colour `'#zzz'` → default.
  - `decodeHash(encodeHash(cfg))` deep-equals `cfg` for a cfg with 6 changed fields and 2 toys.
  - `decodeHash('#c=!!!garbage')`, `decodeHash('')`, `decodeHash('#c=' + base64url('{"mass":"heavy","disc":{"amount":0.9}}'))`: none throw; the last gives mass 0.5 and disc.amount 0.9 (Review Focus 1).
  - `derive(normalize({view:{closer:1}, mass:1, disc:{width:1}}), {w:1440,h:900})`: distance 6, no NaN fields. With closer 0: distance 30. Phone viewport `{w:375,h:700}` → `mobile:true`, scale ×1.35 (Review Focus 2).
  - `encodeHash` with a `data:` photo excludes `photo`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `src/config.js` per Interfaces. `normalize` deep-merges onto a clone of DEFAULTS, clamps numbers, validates enums and hex colours, truncates objects to 3.
- [ ] **Step 5:** Run `npm test`. Expected: all config tests PASS.
- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat: scaffold, module pattern, config with hash encoding"`

---

### Task 2: Physics (CPU reference)

**Files:**
- Create: `src/physics.js`, `tests/physics.test.js`

**Interfaces:**
- Consumes: `BH` module pattern.
- Produces (all in r_s = 1 units, c = 1):
  - `BH.traceRay(D, b, opts?) -> {captured: boolean, deflection: number}`: photon from distance D with impact parameter b, integrating u'' = −u + 1.5u² in φ with RK4. Step `dφ = clamp(0.06 * u_far/u, 0.004, 0.06)`-style adaptivity (builder's choice). This is the **same scheme the shader uses**, so these tests validate the shader's integrator.
  - `BH.CRITICAL_B = 2.598076` (3√3/2).
  - `BH.discOmega(r, scale, pace) -> number`: screen angular speed, `pace * 0.6 * r ** -1.5 / scale`.
  - `BH.discDoppler(r, cosTheta) -> g`: `β = sqrt(0.5 / (r - 1))`, `γ = 1/sqrt(1-β²)`, `g = sqrt(1 - 1.5/r) / (γ * (1 - β * cosTheta))`. `cosTheta` = cosine between the gas velocity and the direction toward the camera.
  - `BH.teddyStep(state:{r, r0}, dt) -> {r, r0, g, brightness, stretch, done}`: radial infall from rest at r0 seen by a distant observer. `dr/dt = -(1 - 1/r) * sqrt(max(0, 1/r - 1/r0)) / sqrt(1 - 1/r0)`. Use substeps when dt is large; never let r ≤ 1. `v = sqrt((1/r - 1/r0)/(1 - 1/r0))`, `g = sqrt(1 - 1/r) * sqrt((1 - v)/(1 + v))`, `brightness = g ** 3`, `stretch = 1 + 0.25 * smoothstep(6, 1.5, r)` (gentle: anti-gore), `done = brightness < 0.02`. Start at `{r: 20, r0: 20.5}` so it's moving.
  - `BH.orbitPosition(radius, tiltDeg, phaseDeg, t, scale, pace) -> [x,y,z]`: circular orbit in a plane tilted about the x-axis. The disc plane is y = 0. Angular speed from `discOmega(radius, …)`.

- [ ] **Step 1: Write failing tests:**
  - `traceRay(1000, 2.55).captured === true`; `traceRay(1000, 2.65).captured === false`.
  - Weak field: `traceRay(10000, 200).deflection` within 10% of `2/200`.
  - `discOmega(3,1,1) > discOmega(6,1,1)`; `discOmega(6,2,1) < discOmega(6,1,1)` (heavier = slower).
  - `discDoppler(6, 1) > 1 > discDoppler(6, -1)`; `discDoppler(6, 0) < 1` (transverse + gravitational redshift).
  - Teddy: stepping 2000× with dt 0.05: r strictly decreasing, always > 1, `g` strictly decreasing, reaches `done === true`, and stretch ≤ 1.25 the whole way. One step with dt = 10 gives r > 1 and no NaN.
  - `orbitPosition` with tilt 0 always has |y| < 1e-9 and length ≈ radius.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/physics.js`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: physics reference (ray tracing, Doppler, infall, orbits)`

---

### Task 3: Shader builder + engine core (hole, photon ring, starfield, camera)

**Files:**
- Create: `src/shader.js`, `src/engine.js`, `tests/shader.test.js`
- Modify: `index.html` (full-window `<div class="bh-stage">` + boot `BH.createEngine`)

**Interfaces:**
- Consumes: `BH.normalize`, `BH.derive`, `BH.CRITICAL_B`.
- Produces:
  - `BH.features(cfg) -> {disc:boolean, universe:'stars'|'plain'|'photo', objects:Array<{shape, skin}>, teddy:boolean}`. Shader cache key = `JSON.stringify(features)`.
  - `BH.buildFragmentShader(features) -> string`: GLSL ES 1.00 with `#define`s for exactly the features present (`HAS_DISC`, `UNIVERSE_STARS|UNIVERSE_PLAIN|UNIVERSE_PHOTO`, `OBJ_COUNT n`, `HAS_SHAPE_STAR`, `HAS_SHAPE_TORUS`, `SKIN_<NAME>` per skin used, `HAS_TEDDY`). The code for absent features is not emitted at all (chunks are joined, not `#ifdef`-guarded).
  - `BH.createEngine(root: HTMLElement, cfg, opts:{interactive:boolean, mobileAuto:boolean}) -> {setConfig(cfg), setView({yaw,tilt}), resize(), start(), stop(), destroy(), stats() -> {fps, renderScale, steps}, ok:boolean}`.
- Ray setup in the shader: camera at distance `distance` looking at the hole. The view is offset so the hole sits at (`view.x`, `view.y`) of the frame. For each ray, build the orbital-plane basis from camera position and direction, integrate u(φ) with the Task 2 scheme (max 160 steps auto, 100 lighter, 220 sharper), capture at r < 1.0, escape at r > max(60, distance·2) → escape direction → universe.
- Starfield: procedural hashed cells on the escape direction (3 octaves of point stars with size/brightness variance and slight colour temperature). No texture.
- Render-scale: lighter 0.35, auto starts 0.5 and adapts in [0.35, 0.75] keeping the frame time ≤ 20 ms (EMA over 30 frames, change by 0.05 at most once per second), sharper 0.75. Canvas CSS-scaled to the root. DPR capped at 2.
- Lifecycle: as in Global Constraints (IntersectionObserver, visibilitychange, context loss, reduced motion, ResizeObserver on root). If WebGL is missing or `compileShader`/`linkProgram` fails, `ok = false`, the root's background is `cfg.universe.plain`, one `console.warn`, nothing throws.

- [ ] **Step 1: Write failing tests** (`tests/shader.test.js`):
  - `buildFragmentShader(features(DEFAULTS))` contains `#define HAS_DISC` and `UNIVERSE_STARS`, and contains neither `OBJ_COUNT` nor `HAS_TEDDY` nor the substring `sdStar`.
  - With 1 orb/cereal: contains `#define OBJ_COUNT 1`, `SKIN_CEREAL`, no `SKIN_METAL`, no `sdTorus`.
  - Every generated shader for a set of 6 representative feature combos has balanced braces and contains `void main()` exactly once.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/shader.js` (core chunks only in this task: header, integrator, starfield, plain universe, main) and `src/engine.js`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.** `preview_start` "editor", open `http://localhost:8123/`. Expected: black shadow in a lensed starfield, stars visibly bent into arcs close to the shadow, a thin bright ring at the shadow's edge, no console errors. In the console, `__engine.stats().fps` ≥ 50.
- [ ] **Step 6: Failure path (Review Focus 3).** In the console, create an engine with a deliberately broken shader by temporarily stubbing `BH.buildFragmentShader = () => 'garbage'`. Expected: `ok === false`, the bg colour shows, exactly one warning, no uncaught error.
- [ ] **Step 7:** Commit `feat: ray-traced black hole with lensed starfield`

---

### Task 4: Accretion disc

**Files:**
- Modify: `src/shader.js` (disc chunk), `src/engine.js` (disc uniforms, time accumulation)

**Interfaces:**
- Consumes: `BH.discDoppler` formula (re-implemented in GLSL, same constants), `BH.derive().discOuter`.
- Produces: uniforms `uDisc` (amount, brightness, outer, turbulence), `uGlow`, `uDiscColorA/B`, `uColorMode`, `uTime`.
- Disc lies in the plane y = 0, from r = 3 to `discOuter`. A ray picks up colour every time it crosses y = 0 between steps (linear interpolate the crossing), so the arch over the top and the thin ring underneath appear. Accumulate with front-to-back alpha (opacity from `amount`, ≤ 0.95 per crossing).
- Emission: true mode uses the thin-disc profile `T ∝ r^-0.75 * (1 - sqrt(3/r))^0.25`, multiplied by the Doppler g (scaled by glow: `gEff = mix(1, g, glow)`), mapped through a warm blackbody-ish ramp (deep red → orange → cream-white → faint blue-white). Brightness × `gEff^4`. Custom mode: mix(colorA, colorB, normalised radius), then the same `gEff` brightness factor and a hue shift scaled by glow.
- Turbulence: 3-octave value noise in co-rotating coords `(log r, φ − ω(r)·t)`, so the inner parts visibly orbit faster, stretched along φ. Scaled by `turbulence`.
- Time: `t += dt * pace / scale` on the CPU (heavier = slower). Drift: if `view.drift`, yaw += 1.2°/s.
- Tone mapping: ACES-style filmic curve + slight bloom-free glow (a cheap radial lift around the photon ring). The disc must not clip to flat white over large areas.

- [ ] **Step 1: Browser check (default).** Reload. Expected, compared with spec refs: a near-edge-on disc with the far side lensed into an arch above the shadow and a thin ring below it. With glow 0.8 the **left/right brightness clearly differs** (Review "no symmetric disc" anti-goal). Inner parts swirl faster than outer ones.
- [ ] **Step 2:** In the console `__engine.setConfig(BH.normalize({glow:0}))`: the disc is symmetric. `({view:{tilt:5}})`: a nearly round top-down disc with a slight ring. `({disc:{colorMode:'custom', colorA:'#7fe3ff', colorB:'#5a2bff'}})`: a cyan→violet disc with the beaming still visible.
- [ ] **Step 3:** Extreme check (Review Focus 2): `({mass:1, view:{closer:1}, disc:{width:1, amount:1, brightness:2}})`. No NaN/black speckles, no flat white blowout, `stats().fps` ≥ 30 (adaptive scale may drop).
- [ ] **Step 4:** Screenshot the default for the record (`docs/shots/default.png`).
- [ ] **Step 5:** Commit `feat: accretion disc with Doppler beaming and turbulence`

---

### Task 5: Universe options (galaxy band, nebula, plain, photo)

**Files:**
- Modify: `src/shader.js` (galaxy, nebula, photo-flat, photo-pano chunks), `src/engine.js` (photo texture upload, `setConfig` reload when the photo changes)

**Interfaces:**
- Consumes: `cfg.universe`.
- Produces: `engine.setPhoto(imageOrNull, kind)` (called by the editor and by the snippet boot).
- Galaxy band: a soft band around a great circle tilted 25° from the disc plane, with fbm dust lanes. Nebula: 2-colour fbm haze (`nebulaA/B`) on the escape direction. Both are additive over the stars and scaled by their sliders.
- Photo flat: a plate perpendicular to the camera's *default* view axis, at a far distance, sized to fill the frame at the default view. UVs outside [0,1] are mirrored (`1 - abs(1 - mod(uv, 2))`). Pano: equirectangular lookup on the escape direction. `photoKind` is auto-set to `'pano'` when the aspect ratio is in [1.9, 2.1].
- Textures: WebGL1 NPOT rules apply (CLAMP_TO_EDGE + LINEAR, mirroring done in the shader).

- [ ] **Step 1: Browser check.** Each mode via `setConfig`: stars+galaxy+nebula visible and lensed. Plain colour is flat, with only the disc and shadow. Load any local test photo (create `tests/fixtures/table.jpg`: 1200×800 drawn by a small canvas script, checkerboard + text "TABLE", so the lensing is easy to read). Expected: the checker lines bend around the shadow with a visible Einstein ring, and rotating yaw 180° shows mirrored photo, not empty sky.
- [ ] **Step 2:** Commit `feat: universe options incl. lensed user photo`

---

### Task 6: Editor panel, drag-rotate, hash sync, photo upload

**Files:**
- Create: `src/editor.js`
- Modify: `index.html` (panel container, styles)

**Interfaces:**
- Consumes: `BH.normalize`, `BH.encodeHash`, `BH.decodeHash`, `engine.setConfig`, `engine.setView`, `engine.setPhoto`.
- Produces: `BH.CONTROLS: Array<{group, key (dot path), label, hint?, type:'slider'|'toggle'|'color'|'select'|'button', min?, max?, step?, options?}>` and `BH.bootEditor(stageEl, panelEl)`. `BH.downscalePhoto(file, size:'small'|'medium'|'large') -> Promise<{dataUrl, bytes, w, h, kind}>` (rejects with a friendly `Error.message`).
- Groups and labels (final copy):
  - **Black hole:** "How heavy", "One-side glow" (hint: *Gas racing toward you looks brighter. Real black holes do this.*), "Pace"
  - **Disc:** "How hungry", "Brightness", "Width", "Colour" (True colours / My colours + two pickers), "Swirl"
  - **View:** "Come closer" (hint: *Never closer than a safe orbit.*), "Tilt", "Drift", "Position" (x/y)
  - **Universe:** "Sky" (Stars / Plain colour / My photo), "Stars", "Milky band", "Nebula" + 2 pickers, "Colour", "Upload photo", "…or image link" (https URL, e.g. a Tilda-hosted image; used as-is in the export), "Photo size"
  - **Toys:** filled by Task 7 / 8
  - **Quality:** Auto / Lighter / Sharper, plus a small fps readout
  - Buttons: **Back to calm**, **Copy snippet**, **Download .html** (the last two are wired in Task 9)
- Visual direction: dark translucent panel on the right (320px), collapsible to an icon, system font, generous spacing, no harsh colours. The black hole stays the visual focus. On narrow screens the panel becomes a bottom sheet.
- Behaviour: every change → `normalize` → `engine.setConfig` → `history.replaceState` with `encodeHash` (debounced 200ms). Load reads `location.hash`. Drag on the stage changes yaw/tilt (tilt clamped [0,89]), with easing so it never snaps. "Come closer" changes are eased over ~1.5s ("Approaching is always gradual"). Back to calm eases everything to DEFAULTS over ~2s and keeps the uploaded photo in memory.

- [ ] **Step 1: Write failing test** `tests/editor-schema.test.js`: every `CONTROLS[i].key` resolves to a path in `DEFAULTS`. Slider min/max match the ranges in Task 1. No label contains "ISCO", "geodesic", "Schwarzschild", "Kerr" or "spin parameter".
- [ ] **Step 2:** `npm test`. Expected: FAIL. **Step 3:** Implement. **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.** Every control visibly changes the picture. Reloading the page restores the state from the hash. Back to calm returns smoothly to the default. Drag-rotate is smooth.
- [ ] **Step 6: Review Focus 4.** Upload (a) a 6000×4000 PNG generated via canvas → downscaled to the chosen size, size readout shown; (b) a `.txt` renamed `.jpg` and (c) a 0-byte file → friendly message in the panel, previous universe kept, no console error.
- [ ] **Step 7:** Commit `feat: editor panel with plain-language controls`

---

### Task 7: Orbiting objects: orb with 4 skins

**Files:**
- Modify: `src/shader.js` (object chunk, skin chunks), `src/engine.js` (object uniforms from `BH.orbitPosition`), `src/editor.js` (Toys group: "Launch an object" with shape/skin/orbit controls, list of launched objects with remove ×, max 3)

**Interfaces:**
- Consumes: `BH.orbitPosition`, toy orbit radius from Task 1 `derive` rule, `features().objects`.
- Produces: uniforms `uObj[i]` = vec4(pos.xyz, radius) + `uObjRot[i]` (spin angle), `OBJ_COUNT` recompiles when the count or skin set changes.
- Object radius 0.6 r_s (orb). Per integration step: if the segment's closest distance to the object < radius + 0.1, do an exact ray–sphere test on that straight segment. Hits shade the object and stop the ray.
- Lighting: diffuse from the direction toward the hole's centre, with colour = average disc colour × `disc.brightness`, plus a dim fill from the universe colour.
- Skins (procedural, in object-local coordinates so they rotate with the spin):
  - rocky: 2-colour fbm bands + crater dimples, dusty brown-grey
  - fluffy: soft albedo with noisy alpha falloff at the limb + strong rim light (looks like a pompom)
  - cereal: golden-orange `#d9902f`→`#f2c46b` toasted gradient, bump noise, sparse white sugar specks
  - metal: Fresnel mirror sampling a blurred version of the universe colour (no second trace), plus a disc-colour highlight
- Only "orb" is selectable in this task. Star/torus appear greyed with "coming soon".

- [ ] **Step 1: Browser check.** Launch an orb with each skin. It orbits outside the disc, is lit from the disc side, and passing behind the hole shows a second, stretched image peeking around the other side. 3 objects + extreme config (Review Focus 2) → fps ≥ 30, no artefacts.
- [ ] **Step 2:** `npm test` (shader tests from Task 3 still pass with object features). Expected: PASS.
- [ ] **Step 3:** Commit `feat: launchable orbiting orbs with skins`

---

### Task 8: The teddy that never falls in

**Files:**
- Modify: `src/engine.js` (teddy state via `BH.teddyStep`, texture from 🧸 drawn on a 128×128 canvas, with a drawn fallback teddy shape if emoji rendering is empty), `src/shader.js` (teddy card chunk), `src/editor.js` (toggle "Teddy" with hint: *Seen from far away, nothing ever quite falls in. It slows, reddens and fades at the edge.*)

**Interfaces:**
- Consumes: `BH.teddyStep`.
- Produces: uniforms `uTeddy` = vec4(pos, size), `uTeddyLook` = vec3(g, brightness, stretch).
- The teddy falls radially along a fixed direction 35° above the disc plane, toward the camera's side, so it stays visible. It's a camera-facing card (size 1.2 r_s), stretched along the fall direction by `stretch`, tinted by redshift (multiply the colour toward deep red as g drops: `col * vec3(1, g, g*g)`), alpha × brightness. Ray–plane test on segments near it, so it is lensed too. When `done`, fade in a new teddy from r = 20 over 1.5s (loops endlessly).

- [ ] **Step 1: Browser check.** Toggle on. The teddy drifts in, slows dramatically, reddens and fades just outside the shadow, never crossing it, then a new one appears. Stretch is gentle. No glitch at the restart.
- [ ] **Step 2:** Commit `feat: falling teddy with time-dilation fade`

---

### Task 9: Export (snippet + download)

**Files:**
- Create: `src/export.js`, `tests/export.test.js`
- Modify: `src/editor.js` (wire Copy snippet / Download .html; show snippet size, warn > 400 KB)

**Interfaces:**
- Consumes: `BH.modules` (runtime ones only), `BH.normalize`, `BH.DEFAULTS`.
- Produces: `BH.buildSnippet(cfg, photo: null | {dataUrl} | {url}) -> string` and `BH.buildStandaloneHtml(cfg, photo) -> string` (snippet wrapped in a minimal full-page document with a 100vh relative container).
- Snippet script body: `(function(){ var CONFIG = {…}; <runtime module sources as "(fn)(BH)" calls on a local BH object>; boot })();`. **The BH object is local to the IIFE**, so two snippets on one page don't collide. The CONFIG literal is pretty-printed with a plain-language comment on each line (copy from `BH.CONTROLS` labels/hints). Root lookup: as in `blackhole-bg-tilda.html` (`document.currentScript.previousElementSibling` walk, then the last `.bh-bg` not yet claimed, marked with `data-bh-on`). Boot waits for the root to have a non-zero size (ResizeObserver). `opts.interactive=false`, `mobileAuto=true`.
- Toy objects, teddy and photo are included only if present in cfg; shader chunks for absent features never ship (they're already omitted by `buildFragmentShader`, which runs at boot in the snippet).

- [ ] **Step 1: Write failing tests:**
  - Default snippet starts with `<div class="bh-bg"`, contains `<style>` with `pointer-events:none`, contains `var CONFIG`, contains no `bootEditor`/`CONTROLS`/`buildSnippet` source.
  - Snippet with `{url:'https://example.com/t.jpg'}` contains that URL and no `data:image`. With a dataUrl, it contains it once.
  - **Review Focus 5:** evaluate two copies of the snippet's JS in a fresh Node `vm` context with a minimal DOM stub (two `.bh-bg` elements, `document.currentScript` set per run, no WebGL → fallback path). The DOM stub's `canvas.getContext` returns null, so the fallback path runs. Each run claims a different root (`data-bh-on` set on both), no global leaks (`'BH' in context === false`), no throw.
- [ ] **Step 2:** `npm test`. Expected: FAIL. **Step 3:** Implement. **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Browser check.** Download .html for (a) default, (b) photo + 2 toys + teddy. Open each from disk: identical look to the editor (minus the panel), resizing works, switching tabs pauses (fps readout/console), a narrow window (375px) shows automatic phone framing. Make a test page `tests/fixtures/two-blocks.html` with 2 pasted snippets, one in a 0-height block that grows after 1s → both render.
- [ ] **Step 6:** Commit `feat: Tilda snippet and standalone export`

---

### Task 10 (phase 2): Star and torus shapes

**Files:**
- Modify: `src/shader.js` (`sdStar`, `sdTorus` chunks + short local sphere-traced march), `src/editor.js` (enable shapes), `tests/shader.test.js`

**Interfaces:**
- Consumes: object pipeline from Task 7.
- Star: 5-point star extruded with rounded edges, puffed (cereal-piece-like), bounding radius 0.8. Torus: major 0.55, minor 0.2. Inside the bounding sphere along the current segment, run ≤ 24 SDF march steps. Normal via 4-tap tetrahedral gradient. All skins apply.

- [ ] **Step 1: Failing tests:** features with star → contains `sdStar` and `HAS_SHAPE_STAR`, no `sdTorus`. Torus → vice versa. `npm test` FAIL → implement → PASS.
- [ ] **Step 2: Browser check.** A cereal star and a metal torus orbit and tumble (spin about a tilted axis), are lensed behind the hole, and fps stays ≥ 30 with 3 objects at Auto quality on the Mac. Export a snippet with a cereal star and verify it in the downloaded file.
- [ ] **Step 3:** Commit `feat: star and torus shapes`

---

### Task 11: Final pass: performance and calm-default polish

- [ ] **Step 1:** At default settings on the Mac, full-window, Auto quality: run for 2 minutes, `stats().fps` ≥ 55, render scale settles ≥ 0.5, and the machine stays quiet (check Activity Monitor GPU %, report the number).
- [ ] **Step 2:** Compare the default screenshot side by side with the spec references (arch over top, thin ring underneath, one-side glow, warm palette). Tune default values only (`DEFAULTS`, tone curve) if something reads wrong. Re-run `npm test`.
- [ ] **Step 3:** Reduced motion: emulate `prefers-reduced-motion` in the pane → one still frame in both editor and exported file.
- [ ] **Step 4:** Commit `chore: tune defaults and performance`
