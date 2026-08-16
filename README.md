# WinterFell

**A WebGPU neon runner: twenty scenes, three and a half kilometres of track, and somewhere to arrive.**

[Play the live demo](https://cg-winter-fell.vercel.app) · Steer with <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd>. <kbd>Space</kbd> pauses.

<p align="center">
  <a href="https://cg-winter-fell.vercel.app">
    <img src="./docs/opening-sector.png" alt="Sector 1 — the craft threading a field of neon blocks under a city skyline" width="820" />
  </a>
</p>
<p align="center">
  <a href="https://cg-winter-fell.vercel.app">
    <img src="./docs/arrival-uts.png" alt="Sector 20 — the track opens onto the UTS forecourt" width="820" />
  </a>
</p>

The run is a route, not a loop. Twenty scenes stand along it — a neon city, a beacon coast, a machine graveyard, a leviathan's ribcage — each owning 1800 units of track, and the palette and speed turn over on the same stride. Speed ramps once across the whole route and stops; there is no lap that outruns the player. Past the last scene the field ends, the track opens onto the UTS forecourt, and the craft comes to rest. Score is distance survived, in metres.

Nothing is loaded from disk. Every skyline, ridge, whale, turbine, block and letter is geometry built at runtime, and every sound is synthesised from oscillators — the repository ships no models, textures or audio files.

## Rendering

- **One renderer, two backends.** Three's `WebGPURenderer` drives WebGPU where the browser has it and its own WebGL2 backend where it doesn't. That choice is load-bearing: the bloom pass is built from three's TSL node pipeline, so a plain `WebGLRenderer` could not run it and the fallback would quietly lose the glow the whole look rests on.
- **Bloom is the look.** Emissive materials alone read flat; the halo around them is the effect. Blocks are drawn as a near-black body plus a bright edge frame so the bloom pass has a line to bite rather than a slab.
- **Instanced obstacles.** Body and frame are separate `InstancedMesh`es sharing one set of matrices — a whole section is two draw calls — and three sections are live at a time, generated from their index rather than stored.
- **Scenery per tile.** Each kilometre tile merges its static pieces into a handful of draw calls; only what moves — fish, airships, pacing war machines, turbine rotors, lighthouse beams — stays an animated instanced mesh.
- **Fog that doesn't recompile the world.** Distance fog in the sky's own colour, as one object whose colour is mutated. Declaring it as JSX rebuilt it on every palette change, and fog is part of a material's program key, so the renderer recompiled every material in the scene inside one frame — a freeze that landed exactly on the sector boundary.

## The route

The field used to be four named formations, one per section: the player met each surprise exactly once and then flew it for half a minute. There are no formations now. Three continuous functions of world *z* decide what stands where — the lane, the pressure, and the balance between broad low blocks you see over and narrow tall ones you see past — sampled every 50 units, with clusters riding on top. None of them knows where a section boundary is, so the seams are gone.

Four rules hold it together:

- **A guaranteed lane.** One clear corridor runs the whole route, and it never sweeps sideways faster than the craft can follow at the speed that stretch is flown. Difficulty bought by narrowing it is free — the field keeps every block it had, they just leave a line that has to be aimed at rather than a direction to hold.
- **A corridor that closes.** The corridor is empty ground by construction, so one wider than the ground the lane covers *inside the fog* is a band of track that is open for as far as anyone can see. Its width is solved against view distance, not against the section, which is what removes the "hold a straight line and never dodge anything" run.
- **Blocks per second, not per unit.** Density is budgeted against flight time (38–76 blocks a second). Budgeted per unit of track, the same count arrives more than twice as fast late in the run as it does at the start, against a fog that gives about a third of a second to see anything coming.
- **No block may be a wall.** Height is bought with width — `width × height ≤ 1.05` of the base block — so a piece that stands over the eye line is under five units wide and a broad one stays low. There is no roll of the dice that produces a hoarding across the horizon.

Each run also draws one seed at load, and a handful of the constants that were the route's personality become that run's personality: how long a stretch holds its character, whether it is built of slabs or spires, where its corridor generally sits, how far the lane commits before it turns. None of it changes what the route is allowed to ask of the craft.

The journey itself — the winding, the climbs, the dive into a valley — is two centreline functions applied at render time. Gameplay happens in a straight, flat logical space, so relative positions stay exact and the fairness sweep is untouched by construction.

## Fairness, measured rather than asserted

Whether a run is winnable is a property of the layout, so it is measured directly instead of playtested. `bench/fairness.mjs` imports the real generator through the dev server, walks each section with fresh seeds, and asks at every step whether a player travelling at the game's own speeds could still be somewhere safe — reporting the fraction of layouts with no path through, the tightest gap, and how one-sided the field is in view.

```bash
npm run dev                                     # in one shell
node bench/fairness.mjs --sections 17 --trials 60
```

Playtesting this headlessly does not work: WebGL in headless Chromium falls back to software rasterisation and frames take seconds.

## Benchmarks and probes

Each script answers one question that the game cannot answer about itself, and each needs `playwright` (`npm i -D playwright && npx playwright install chromium`).

| Script | Question |
| --- | --- |
| `bench/run.mjs` | What do the rendering choices cost? Plays four scenarios — WebGPU/WebGL × instancing on/off — and samples renderer stats every frame. |
| `bench/leak.mjs` | Does a long run give its memory back? Counts live GPU buffers and textures by wrapping the device before page scripts run. |
| `bench/jank.mjs` | Where is the hitch? Keeps every frame's (distance, frame time) and reports the worst frames by distance. |
| `bench/pipelines.mjs` | Is the hitch shader compilation? Records pipelines built per frame against frame time. |
| `bench/vberror.mjs` | Missing attribute, or buffer freed mid-draw? Stamps errors and buffer destroys on one clock. |
| `bench/attrowner.mjs` | Which mesh is drawing a released attribute? Walks the live scene instead of reading the pipeline's complaint. |
| `bench/probecost.mjs` | Does `?perf=1` change how the game runs? Times frames from outside the app, identically on both URLs. |

```bash
node bench/run.mjs --seconds 45 --width 3840 --height 2160
node bench/leak.mjs --seconds 90            # needs npm run preview
```

Two things worth knowing when reading the output. Frame rate is paced by the compositor (~120 fps here), so on a desktop GPU most scenarios pin to that cap and FPS will not separate them — draw calls and triangles are the useful signal. And instancing is a trade, not a free win: it collapses a section into one draw call but also into one bounding volume, so per-instance frustum culling is lost and more geometry is submitted. The scripts report both sides.

## URL flags

Opt-in, so a normal visit is unaffected.

| Flag | Effect |
| --- | --- |
| `?perf=1` | Collect frame stats into `window.__bench`. |
| `?renderer=webgl` | Force the WebGL2 path even where WebGPU exists. |
| `?instancing=off` | Draw each block as its own mesh — the naive baseline. |
| `?immortal=1` | Ignore collisions, so a run streams for a whole measurement window. |
| `?craft=plane` | Fly the interceptor instead of the kart. |

## WebGPU field notes

Three failures in this stack look identical from the outside — the last frame stays on screen while the HUD keeps counting — and each is handled where it happens:

- **A geometry's buffers are released twice.** In three r174, `initGeometry` registers a dispose listener per *render object*, so a shadow-casting mesh tears down twice; the second pass throws inside React's unmount commit, ends the frame loop, and leaves every buffer after the index resident on the GPU. Guarded with the `undefined` check the release path was missing.
- **A lost GPU device says nothing.** Every submit after it is discarded in silence — no throw, no console. The banner goes straight into the DOM, because a device loss can take the renderer down without touching the component tree.
- **The post pass owns rendering.** Taking a render priority above zero means whatever it composes is the only thing that reaches the screen, so a throw there stops the picture while the simulation carries on. It catches and falls back to plain rendering.

Restarting reloads the document rather than remounting the scene: react-three-fiber v9 no longer disposes on unmount, and most geometry here is built by hand, so a remount left the previous run's buffers alive — measured at ~800 live buffers after one restart against 463 cold.

## Run locally

```bash
npm install
npm run dev
```

`npm run build` produces a production build, `npm run preview` serves it — the leak and pipeline probes want the served build.

## Reviewing the route

Reaching the later scenes by playing takes a while. Two dev-only flags shortcut it, wired up as scripts:

```bash
npm run dev:scenic           # no obstacles, no crashes — just the ride
npm run dev:end              # straight to the arrival at UTS
npm run dev:sector --z=12600 # start this many units along the route
```

Both are plain URL flags (`?scenic=1`, `?z=`), so they work against a running server too: `localhost:5173/?scenic=1&z=21600`. Scenes change every 1800 units, so scene *n* starts at `(n - 1) * 1800`. Everything behind them is fenced with `DEV ONLY` comments.

## Stack

React 19 · TypeScript · Three.js (WebGPU) · React Three Fiber · Drei · Cannon · Zustand · Vite
