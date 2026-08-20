import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import ObstacleField from './components/ObstacleField';
import LevelDirector from './components/LevelDirector';
import Score from './components/Score';
import Pause from './utils/Pause';
import { useWebGPUSupport } from './hooks/useWebGPURenderer';
import { ACESFilmicToneMapping, Fog } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { useStore } from './store/store';
import { benchFlags } from './utils/bench';
import { paletteFor } from './config/levels';
import PerfProbe from './utils/PerfProbe';
import PostFX from './components/PostFX';
import Warmup from './components/Warmup';
import Scenery from './components/Scenery';
import SectorBanner from './components/SectorBanner';

/**
 * three r174 releases a geometry's GPU buffers twice, and the second pass
 * throws.
 *
 * `Geometries.initGeometry` adds a `dispose` listener per *render object*, not
 * per geometry. A mesh lit by a shadow-casting light is one geometry with two
 * render objects — the shadow pass and the camera pass — so `dispose()` fires
 * two identical teardowns. The first empties the attribute map. The second
 * finds nothing, and hits this in `Attributes.delete`:
 *
 *     const attributeData = super.delete( attribute );   // DataMap: null when absent
 *     if ( attributeData !== undefined ) {               // null passes
 *         this.backend.destroyAttribute( attribute );    // ...and destroys nothing
 *     }
 *
 * `destroyAttribute` then asks the backend for a record that no longer exists.
 * `DataMap.get` hands back a fresh `{}` rather than `undefined`, so the next
 * line is `undefined.destroy()` — the TypeError seen once per tile.
 *
 * That throw lands inside React's unmount commit and ends the frame loop: the
 * last frame stays on screen while the HUD keeps ticking from the store. It
 * also aborts the teardown midway, so every vertex buffer after the index is
 * left resident on the GPU — a run leaks most of the world it has driven past.
 *
 * The guard is the `undefined` check three meant to write. No record means
 * nothing to destroy, so the second teardown becomes a no-op and the first is
 * allowed to finish.
 */
const guardAttributeRelease = (renderer: unknown) => {
    const attributes = (
        renderer as { _attributes?: Record<string, unknown> } | null
    )?._attributes;
    const records = attributes?.data as WeakMap<object, unknown> | undefined;
    const release = attributes?.delete as
        | ((attribute: object) => unknown)
        | undefined;
    // Private fields: if a three upgrade renames them, leave the renderer be.
    if (!attributes || !records?.has || !release || attributes.__guarded) {
        return;
    }
    // Under ?perf=1 the swallowed calls are counted: a non-zero number is the
    // double teardown happening for real, and each one is a throw that no
    // longer reaches the frame loop.
    let swallowed = 0;
    attributes.delete = (attribute: object) => {
        if (records.has(attribute)) return release.call(attributes, attribute);
        swallowed += 1;
        return null;
    };
    attributes.__guarded = true;
    if (benchFlags.perf) {
        Object.defineProperty(window, '__doubleRelease', {
            get: () => swallowed,
            configurable: true,
        });
    }
};

/** Shown once the run crosses into the final scene: no loop past here. */
const FinaleBanner = () => {
    const arrived = useStore(
        state => Math.abs(state.playerPosition[2]) > 35350,
    );
    const restart = useStore(state => state.restart);
    if (!arrived) return null;
    return (
        <div className="finale-banner">
            <h2>WELCOME TO UTS</h2>
            <button className="finale-again" onClick={restart}>
                Back to Start
            </button>
        </div>
    );
};


/**
 * Distance fog in the sky's own colour. Sections used to pop into view at
 * the far plane with nothing to soften them; now the trail fades out ahead,
 * which both hides the seam and gives the night some depth.
 *
 * The fog object is created once and only its colour changes. Declaring it
 * as <fog args={[palette.fog, ...]} /> rebuilt the object whenever the level
 * recoloured the world — and fog is part of a material's program key, so
 * swapping it invalidates every material in the scene at once and the
 * renderer recompiles all of them inside a single frame. That was the freeze
 * that landed exactly on a sector change, with the last drawn frame stuck on
 * the previous palette while the HUD had already moved on.
 */
const LevelFog = ({ color }: { color: string }) => {
    const scene = useThree(state => state.scene);
    const fog = useRef<Fog | null>(null);

    useEffect(() => {
        if (!fog.current) fog.current = new Fog(color, 300, 1000);
        scene.fog = fog.current;
        return () => {
            if (scene.fog === fog.current) scene.fog = null;
        };
    }, [scene, color]);

    useEffect(() => {
        fog.current?.color.set(color);
    }, [color]);

    return null;
};

/**
 * A lost WebGPU device looks exactly like a frozen render loop.
 *
 * When the browser drops the device — a GPU process restart, a driver reset,
 * another tab exhausting VRAM — every subsequent submit is discarded in
 * silence. Nothing throws, so the console stays empty; the store keeps
 * ticking, so the HUD keeps counting; and the canvas holds the last frame
 * that made it through. That is indistinguishable, from the outside, from the
 * teardown bugs above, and it sent an afternoon of bisecting after code that
 * was already correct.
 *
 * So say it out loud. The banner goes straight into the DOM rather than
 * through React, because a device loss can take the renderer down without
 * touching the component tree, and the message has to survive that.
 */
const reportDeviceLoss = (renderer: unknown) => {
    const device = (
        renderer as {
            backend?: {
                device?: {
                    lost?: Promise<{ reason: string; message: string }>;
                    addEventListener?: (
                        type: string,
                        listener: (event: { error?: { message?: string } }) => void
                    ) => void;
                };
            };
        } | null
    )?.backend?.device;
    // The WebGL2 fallback has no device at all, and a three upgrade may move
    // this: in either case there is nothing to watch.
    if (!device?.lost) return;

    const announce = (headline: string, detail: string) => {
        console.error(`[renderer] ${headline}: ${detail}`);
        const banner = document.createElement('div');
        banner.style.cssText =
            'position:fixed;inset:0 0 auto 0;z-index:9999;padding:12px 16px;' +
            'background:#3a0d16;color:#ffd7de;font:14px/1.5 monospace;' +
            'border-bottom:1px solid #ff5470;pointer-events:none';
        banner.textContent = `${headline} — ${detail.replace(/\.$/, '')}. Reload to recover.`;
        document.body.appendChild(banner);
    };

    device.lost.then(({ reason, message }) => {
        announce(`GPU device lost (${reason})`, message || 'no message given');
    });

    // Validation errors do not throw either; they are reported here and
    // nowhere else. One line per distinct message is enough to name the
    // culprit — a broken pipeline repeats itself every frame.
    const seen = new Set<string>();
    device.addEventListener?.('uncapturederror', event => {
        const message = event.error?.message ?? String(event.error);
        const key = message.slice(0, 120);
        if (seen.has(key) || seen.size >= 5) return;
        seen.add(key);
        console.error('[renderer] uncaptured GPU error:', message);
    });
};

interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
    const webGPUAvailable = useWebGPUSupport();
    // ?renderer=webgl forces the fallback path so the two renderers can be
    // benchmarked against the same scene.
    const isWebGPUSupported = webGPUAvailable && !benchFlags.forceWebGL;
    const gameOver = useStore(state => state.gameOver);
    const level = useStore(state => state.level);
    const scenic = useStore(state => state.scenic);
    const palette = paletteFor(level);

    return (
        <>
            <Canvas
                gl={async props => {
                    // One renderer for both backends. WebGPURenderer drives
                    // WebGPU where it exists and its own WebGL2 backend where
                    // it doesn't, which matters here because the bloom pass
                    // (see PostFX) is built from three's node pipeline: a
                    // plain WebGLRenderer could not run it, and the fallback
                    // would silently lose the glow the whole look rests on.
                    const renderer = new WebGPURenderer({
                        ...(props as object),
                        antialias: true,
                        forceWebGL: !isWebGPUSupported,
                    } as never);
                    renderer.toneMapping = ACESFilmicToneMapping;
                    await renderer.init();
                    // init() is what builds the attribute map, so the guard
                    // goes on after it and before the first tile is drawn.
                    guardAttributeRelease(renderer);
                    reportDeviceLoss(renderer);
                    return renderer;
                }}
            >
                {benchFlags.perf && <PerfProbe />}
                <PostFX />
                <Warmup />
                <LevelFog color={palette.fog} />
                <ambientLight intensity={0.55} color="#93a7ff" />
                <directionalLight
                    castShadow
                    position={[50, 100, 100]}
                    intensity={2.4}
                    color="#dfe7ff"
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                {/* A warm bounce from the pumpkins, so the ground is not lit
                    purely by cold moonlight. */}
                <hemisphereLight
                    args={['#ffb066', '#241a2e', 0.5]}
                    position={[0, 40, 0]}
                />
                <Skybox />

                <Physics>
                    <Ground />
                    <Scenery />
                    {/* Mounted from the first frame, parked until the run
                        starts (see usePlayerMovement). Two things depend on
                        it being here early: the camera behind the menu is the
                        run's camera rather than r3f's default at the origin,
                        and the craft's materials are part of what Warmup
                        compiles — 45 render pipelines used to be built on the
                        frame the player was handed control, which held the
                        last menu frame on screen for ~170ms. */}
                    <Player />
                    {onStart && <LevelDirector />}
                    <ObstacleField />
                </Physics>
            </Canvas>
            {/* DEV ONLY: scenic badge. */}
            {onStart && scenic && <div className="scenic-badge">SCENIC</div>}
            {onStart && <FinaleBanner />}
            {onStart && <Score />}
            {onStart && <SectorBanner />}
            {onStart && !gameOver && <Pause />}
        </>
    );
};

export default Game;