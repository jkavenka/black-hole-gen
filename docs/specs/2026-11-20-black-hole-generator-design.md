# Black Hole Generator — Design

## Intent and why

A browser playground for shaping an animated black hole with plain-language controls. It exports a self-contained HTML snippet that can be pasted into a Tilda Zero Block, like the earlier `blackhole-bg-tilda.html` (TRIZ project).

The personal reason: the author is irrationally scared of black holes. The tool is a way to take control of one and make it beautiful and fun instead of frightening. So the experience matters as much as the output. It **starts calm, polished and at a safe distance**. You *choose* to approach it, rotate it, recolour it or swap its universe. Playful extras (a teddy bear, a dinner-table backdrop) are additional controls, never the default.

It should be roughly true to the physics, with no obvious mistakes, and feel magnificent. Exact accuracy is not the aim.

## Goals

1. **Looks like a real (Schwarzschild) black hole**, with the effects that come for free from tracing bent light:
   - a dark shadow about 2.6× the horizon radius, not the horizon itself;
   - a thin, bright photon ring hugging the shadow;
   - the far side of the disc lensed into an arch over the top and a thin ring underneath;
   - the background bent and smeared around the hole, including an Einstein ring and a secondary image;
   - Doppler beaming: the side of the disc moving toward you is brighter and bluer/whiter, the other side dimmer and redder, plus gravitational redshift close in. It's on by default with a strength control (Interstellar switched it off; we can too, but the default is the true look).
2. **Light on the machine.** It must not make a Mac run hot. Smooth at full window size on an Apple-silicon Mac, and acceptable (~30fps) on a mid-range phone in the exported snippet.
3. **Plain-language controls.** No jargon ("spin parameter", "ISCO", "geodesic"). A short hint can explain the real thing for the curious.
4. **Playful, "crazy" controls** next to the true ones (see Controls).
5. **Export a snippet** with the chosen settings baked in. It should be lighter than the editor and include only what's used.

## Anti-goals (failure even if it technically works)

- Scary by default: a sudden zoom, being "sucked in", a camera that starts close, a shaking screen, horror-flavoured anything. Approaching is always gradual and the user's choice.
- Gore: falling objects stretch only *a little* and fade gently. No shredding.
- Obvious physics slips: a symmetric disc while beaming is on, no arch over the top, a shadow the size of the horizon, a background that isn't lensed.
- Fans spinning and the laptop heating up (the failure of the reference tool at adriwin06.github.io/black-hole).
- A control panel full of technical terms.

## Non-goals

- Spinning (Kerr) black holes; the shadow stays round. (Could be a later "it spins" control.)
- Seeing past the horizon or flying inside.
- Video/GIF export, sound, importing 3D models, accounts or cloud saving.

## Constraints

- One self-contained `index.html` (vanilla JS + WebGL, no build step, no server), opened directly in the browser. Any library loads from a CDN with a pinned version, but none is expected.
- Exported snippet: same shape as `blackhole-bg-tilda.html`, i.e. `<div class="bh-bg">` + `<style>` + `<script>`. It fills its parent (`position:absolute; inset:0`), uses `pointer-events:none`, and has a readable `CONFIG` block at the top with plain-language comments. It caps device pixel ratio, pauses when off-screen or the tab is hidden (IntersectionObserver / visibilitychange), handles WebGL context loss, honours `prefers-reduced-motion` (renders a still frame), and falls back to a plain background colour without WebGL.
- No user data leaves the machine. Uploaded photos stay local, or are embedded in the snippet.

## Approaches considered

- **A. One light-bending shader draws the whole scene (chosen).** For each pixel, a fragment shader traces the light ray backwards through curved space (Schwarzschild null geodesics, integrated step by step) and checks what it hits: the disc, a toy, or the universe behind. Every lensing effect follows from the same maths, so it stays consistent whatever the user changes. Toys live inside this space and get lensed too (a teddy passing behind the hole shows a second, stretched image around the other side). Cost: expensive per pixel, handled by the performance measures below.
- **B. Ordinary 3D scene (Three.js) + a 2D distortion effect on top.** Cheaper, and real 3D toys are easy. But the lensing is a screen-space smudge: no arch over the top, and approaching looks wrong. Rejected because it fails at the core look.
- **C. Extend the existing Tilda strand engine.** It draws stylised 2D spirals and can't bend light. Rejected.

## The how (decided)

### Rendering
- The ray tracer works in units of the horizon radius (r_s = 1). Rays are integrated in their own orbital plane (the photon orbit equation u'' + u = 1.5·u², u = 1/r), with larger steps far from the hole and smaller near it, and a maximum step count. A ray ends when it crosses the horizon (black), escapes past a far radius (sample the universe), or hits the disc or a toy.
- **Disc:** thin, from the innermost stable orbit (3 r_s) out to an adjustable outer edge. Brightness and colour fall off with radius (hot inside, cooler outside). Animated turbulence (noise in orbiting coordinates, inner parts orbiting faster as in Kepler's law) so it visibly swirls. Doppler + gravitational shift factor g applied to brightness (~g³–g⁴, scaled by the "one-side glow" control) and to colour.
- **Universe:** procedural starfield with an optional faint galaxy band and nebula, or a user image. Because the ray's escape direction is known, any backdrop gets lensed correctly.
- *(Builder's call)* **Flat photos** are placed as a distant plate behind the hole, sized to fill the frame at the default view. Beyond its edges the photo repeats mirrored, so rotating never shows empty sky. Equirectangular 360° panoramas are detected by their 2:1 aspect ratio and wrapped as a full sky.
- **Performance:** render at reduced resolution and upscale (editor default ~0.5×, adaptive: drop resolution if frames get slow). Cap DPR at 2. Skip expensive work for rays that clearly miss everything. Pause when hidden. Only compile shader features that are in use (toys off → no toy code in the shader). The snippet has its own lower mobile resolution.

### Camera
- Starts at a **safe distance** with the hole about 1/5 of the frame height, tilted so the disc is seen almost edge-on (~80°, the classic arch view). Slow, calm motion.
- "Come closer" slider: gradual and eased, with a closest limit well outside the photon sphere (around 6 r_s). Never crosses in.
- Drag to rotate around the hole (editor only), tilt slider, optional slow automatic drift.
- Framing: the hole's position within the frame (like `centerX/centerY` in the Tilda file), so it can sit behind a headline.

### Scale and speed
- One "How heavy" control sets the hole's apparent size and the disc's rotation speed together: heavier → bigger and slower (orbital period scales with mass). A separate "Overall pace" multiplier exists for taste.
- *(Builder's call)* "How heavy" works as image scale plus pace. The camera's distance in r_s doesn't change, so the lensing looks the same, just bigger and slower. **Only "Come closer" changes the distance in r_s**, so maxing out "heavy" never counts as approaching. The "1/5 of frame height" default applies at medium heaviness.

### Toys (each optional, off by default)
- **Launch an object into orbit:** pick a **shape** (orb, star, torus) and a **skin** (rocky planet, fluffy, cereal, metal), then launch it into a circular orbit outside the disc. Up to ~3 objects at once, each with its own orbit size and tilt. They're real 3D shapes inside the bent space, so they get lensed (the star-shaped cereal shows up warped around the hole as it passes behind).
  - Rendering: an orb is an exact sphere test. Star and torus are drawn with a short local shape-tracing loop (SDF) that only runs when a ray passes close to the object's bounding sphere, so pixels far from the toys pay nothing.
  - Skins are procedural shading: rocky = noise bands and craters; fluffy = soft noisy edge with a fuzzy rim light; cereal = toasted golden-orange with bumps and sugar specks; metal = shiny, reflecting a cheap blurred version of the universe colours. All lit by the disc's glow.
  - **Phasing:** the first version ships the orb with all skins (the "custom planet"). Star and torus shapes come next, once the orb runs light enough.
- **Teddy bear:** falls in along a radial path, as seen from outside: it slows, reddens, dims, stretches slightly along the fall and seems to freeze just above the horizon, fading away. Then a new teddy starts from far out, so it loops ("falling in endlessly"). Computed on the CPU from the slowing of time near the horizon. Rendered as a lensed picture card.
- Toy graphics are drawn in-file (canvas or emoji → texture) so the file stays self-contained.

### Controls (plain language, grouped; final wording up to the builder)
- **Black hole:** How heavy · One-side glow (beaming strength) · Pace
- **Disc:** How hungry (disc amount/density) · Brightness · Width (outer edge) · Colour (default "true" warm temperature palette, or a custom colour or two-colour gradient) · Turbulence
- **View:** Come closer · Tilt · Drag to rotate · Drift on/off · Position in frame
- **Universe:** Stars · Galaxy band · Nebula colours · Plain colour · Your photo (upload, e.g. your dinner table)
- **Toys:** Launch an object (shape + skin + orbit size) · Teddy
- **Quality:** Auto / Lighter / Sharper
- A **"Back to calm"** button resets to the safe default.

### Export
- "Copy snippet" produces the Tilda-ready block described in Constraints. Uploaded photos are downscaled (longest side ~1600px, JPEG) and embedded as a data URI, with the resulting size shown. *(Builder's call)* A photo size/quality choice (small ~150 KB / medium / large), plus an option to reference an image URL instead of embedding (e.g. an image uploaded to Tilda). A "Download .html" option sits alongside.
- The snippet holds no editor UI and no drag-rotate. It runs the same shader with only the features in use.
- Settings are also saved in the URL hash, so a configuration can be bookmarked or reopened.

## Left to the builder

- *(Builder's call)* The editor is desktop-first. It should not break on a phone, but touch-optimised editing isn't a goal. Only the snippet targets phones.

- Editor UI layout and visual design (direction: dark, quiet, minimal, letting the black hole be the star; panel collapsible).
- Exact integrator, step counts, noise functions, colour maths, adaptive-quality thresholds.
- Exact default values, tuned by eye against the reference images (Interstellar-style warm disc, beaming on).
- Whether WebGL1 or WebGL2 (WebGL1-compatible preferred for the snippet).
- The procedural starfield/galaxy method and toy artwork.

## Decided with the author

- Framing: **one** "Position in frame" / size setting. The snippet adapts automatically on phones (like the Tilda file's mobile rule) with no separate phone settings.
- Dinner table: **no built-in scene.** The user uploads their own photo.
- Toys: shapes + skins as above. Orb first, star and torus next.
