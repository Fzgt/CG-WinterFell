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
