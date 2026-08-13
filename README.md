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
