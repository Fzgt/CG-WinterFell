# WinterFell

**A WebGPU-first endless runner built with React Three Fiber and Cannon physics.**

[Play the live demo](https://cg-winter-fell.vercel.app) · Use <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd> to move. Press <kbd>Space</kbd> to pause.

<p align="center">
  <a href="https://cg-winter-fell.vercel.app">
    <img src="./public/docs/landing-page.jpg" alt="WinterFell game preview" width="760" />
  </a>
</p>

WinterFell is a compact real-time graphics experiment set on an endless Halloween trail. The player moves through a continuously recycled world, avoids pumpkins, and collects artifacts for score while the pace increases over time.

## Under the hood

- **Progressive rendering** — selects Three.js `WebGPURenderer` when WebGPU is available and falls back to an ACES-tonemapped WebGL renderer.
- **Endless world streaming** — terrain segments are repositioned ahead of the player instead of allowing the scene to grow without bounds.
- **Instanced scenery** — repeated grass and collectible geometry is rendered through instancing, with only nearby sections kept active.
- **Physics-driven play** — Cannon bodies power movement and collision detection while React Three Fiber coordinates the render loop, camera, and animation state.
- **Feedback systems** — collectible variants, floating scores, progressive speed, sound effects, and music complete the game loop.

## Runtime model

```text
Keyboard input ──→ movement controller ──→ player physics body
                                              │
                                              ├──→ camera follow
                                              ├──→ section streaming
                                              └──→ collisions ──→ score + audio

Browser capability ──→ WebGPU renderer
                   └──→ WebGL fallback
```

## Stack

React 19 · TypeScript · Three.js · React Three Fiber · Drei · Cannon · Zustand · Howler · Vite

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Benchmarking

`bench/run.mjs` drives the game in headless Chromium and samples renderer
stats every frame, so the rendering choices above can be checked rather than
asserted. It plays each scenario for a fixed window and prints a comparison.

```bash
npm run dev                                     # in one shell
node bench/run.mjs                              # in another
node bench/run.mjs --seconds 45 --width 3840 --height 2160
```

`bench/fairness.mjs` checks the obstacle layout instead of the renderer: it
imports the real generator and sweeps each section geometrically, reporting
what fraction of layouts have no path through and how tight the tightest gap
gets. Playtesting this headlessly does not work — WebGL there falls back to
software rasterisation and frames take seconds — so the layout is measured
directly.

```bash
node bench/fairness.mjs --sections 10 --trials 30
```

The app exposes a few opt-in URL flags for it — a normal visit is unaffected:
`?perf=1` collects stats, `?renderer=webgl` forces the fallback path,
`?instancing=off` swaps the pumpkin `InstancedMesh` for one mesh per pumpkin,
and `?immortal=1` ignores collisions so a run keeps streaming for the whole
window.

Two things worth knowing when reading the output. Frame rate is paced by the
compositor (~120 fps here), so on a desktop GPU most scenarios pin to that cap
and FPS will not separate them — draw calls and triangles are the useful
signal. And instancing is a trade, not a free win: it collapses a section into
one draw call but also into one bounding volume, so per-instance frustum
culling is lost and more geometry is submitted. The script reports both sides.

## Reviewing the route

The run passes through twenty scenes, and reaching the later ones by playing
takes a while. Two dev-only flags shortcut it, wired up as scripts:

```bash
npm run dev:scenic          # no obstacles, no crashes — just the ride
npm run dev:end             # straight to the arrival at UTS
npm run dev:sector --z=12600 # start this many units along the route
```

Both are plain URL flags (`?scenic=1`, `?z=`), so they work on a running
server too: `localhost:5173/?scenic=1&z=21600`. Scenes change every 1800
units, so scene *n* starts at `(n - 1) * 1800`.

Everything behind these flags is fenced with `DEV ONLY` comments — the store
flag, the obstacle field's early return, the SCENIC badge and the start
offset — and is meant to be stripped before pushing to the remote.
