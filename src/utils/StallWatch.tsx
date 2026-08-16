import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store/store';
import { registrySize } from './obstacleRegistry';
import { planeSize } from '../config/constants';
import { SECTION_LENGTH } from '../config/obstacles';

/**
 * DEV ONLY — stall watchdog.
 *
 * The run freezes somewhere past 30,000 units, on both renderers, with no
 * errors, no geometry growth (16-32 live across 26 tile transitions) and no
 * JS heap growth (flat at 40 MB). Playwright cannot drive this game on this
 * machine — the physics worker never starts, so the craft sits at the origin
 * — which leaves the actual session as the only place the evidence exists.
 *
 * So: watch every frame, remember the last few things that happened
 * (sector, scenery tile, obstacle section), and when a frame runs long dump
 * one compact line with everything worth knowing. Strip with the rest of the
 * dev tools before pushing.
 */

/**
 * A frame this long is worth naming. The first threshold was 400ms and it
 * never fired: the run does not freeze, it collapses to five or ten frames a
 * second, which reads as frozen because the craft then advances a sliver per
 * frame.
 */
const STALL_MS = 120;
/** Frames between heartbeat lines, so the trend is visible, not just spikes. */
const HEARTBEAT = 120;

interface Marker {
    what: string;
    z: number;
    atFrame: number;
}

const StallWatch = () => {
    const gl = useThree(state => state.gl);
    const heartbeat = useRef(0);

    /**
     * Watch for the render loop dying.
     *
     * The heartbeat log stops mid-run at a steady 60fps with flat geometry,
     * textures and section counts — the frame rate never degrades, the loop
     * simply stops being called, which leaves the last frame on screen and
     * the craft where it was. In react-three-fiber the next frame is only
     * scheduled if the current one returns, so anything thrown inside a
     * per-frame callback ends the loop permanently. This timer lives outside
     * the loop, so it still runs to say so, and the listeners catch whatever
     * threw.
     */
    /**
     * The picture freezes, input stops answering, and the simulation keeps
     * running underneath — the craft goes on to hit something it can no
     * longer be steered around. That is not the loop dying: it is the
     * rendering stopping to reach the screen while everything else carries
     * on, which is what a lost graphics context looks like. It is silent by
     * default on both backends, so listen for it on both.
     */
    useEffect(() => {
        const canvas = gl.domElement;
        const onLost = (event: globalThis.Event) => {
            event.preventDefault();
            const state = useStore.getState();
            console.error(
                `[gpu] context lost at z=${Math.round(-state.playerPosition[2])}` +
                    ` sector=${state.level + 1} — the picture freezes here` +
                    ' while the simulation keeps running',
            );
        };
        const onRestored = () => console.info('[gpu] context restored');
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        const onVisibility = () =>
            console.info(`[gpu] visibility → ${document.visibilityState}`);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [gl]);

    useEffect(() => {
        const onError = (event: ErrorEvent) =>
            console.error(
                '[loop] uncaught',
                event.message,
                event.filename,
                event.lineno,
                event.error?.stack?.split('\n').slice(0, 4).join(' | '),
            );
        const onRejection = (event: PromiseRejectionEvent) =>
            console.error('[loop] unhandled rejection', event.reason);
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);

        let lastSeen = -1;
        let reported = false;
        const timer = setInterval(() => {
            const now = heartbeat.current;
            // Only once a run is properly under way: the loop idles while
            // the menu is up, which was reported as a stop at 21 frames.
            if (now === lastSeen && now > 300 && !reported) {
                reported = true;
                const state = useStore.getState();
                console.error(
                    `[loop] render loop stopped after ${now} frames` +
                        ` at z=${Math.round(-state.playerPosition[2])}` +
                        ` sector=${state.level + 1}` +
                        ` gameOver=${state.gameOver} paused=${state.gamePaused}`,
                );
            }
            if (now !== lastSeen) reported = false;
            lastSeen = now;
        }, 1000);

        return () => {
            clearInterval(timer);
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);
    const last = useRef(performance.now());
    const frame = useRef(0);
    const events = useRef<Marker[]>([]);
    const seen = useRef({ level: -1, tile: -1, section: -1 });
    const worst = useRef(0);
    const frameWindow = useRef({ frames: 0, ms: 0 });
    const blind = useRef(0);

    useFrame(() => {
        const now = performance.now();
        const ms = now - last.current;
        last.current = now;
        frame.current += 1;
        heartbeat.current = frame.current;

        const state = useStore.getState();
        const z = Math.round(-state.playerPosition[2]);
        const tile = Math.floor(z / planeSize);
        const section = Math.floor(z / SECTION_LENGTH);

        const note = (what: string) =>
            events.current.push({ what, z, atFrame: frame.current });

        if (state.level !== seen.current.level) {
            note(`sector→${state.level + 1}`);
            seen.current.level = state.level;
        }
        if (tile !== seen.current.tile) {
            note(`tile→${tile}`);
            seen.current.tile = tile;
        }
        if (section !== seen.current.section) {
            note(`section→${section}`);
            seen.current.section = section;
        }
        if (events.current.length > 8) events.current.shift();

        frameWindow.current.frames += 1;
        frameWindow.current.ms += ms;

        // Frames can keep running while nothing reaches the screen: post
        // processing owns rendering here, so if it stops presenting the loop
        // carries on and the picture does not. Watch the draw calls rather
        // than the frame rate.
        {
            const info = (
                gl as unknown as { info?: { render?: { drawCalls?: number } } }
            ).info;
            const drawn = info?.render?.drawCalls ?? 1;
            blind.current = drawn > 0 ? 0 : blind.current + 1;
            if (blind.current === 90) {
                const state = useStore.getState();
                console.error(
                    `[render] loop running but nothing drawn for 90 frames` +
                        ` at z=${Math.round(-state.playerPosition[2])}` +
                        ` sector=${state.level + 1}`,
                );
            }
        }

        const stats = () => {
            const info = (gl as unknown as { info?: Record<string, never> }).info;
            const memory = (info?.memory ?? {}) as {
                geometries?: number;
                textures?: number;
            };
            const render = (info?.render ?? {}) as {
                drawCalls?: number;
                calls?: number;
                triangles?: number;
            };
            const heap = (
                performance as unknown as { memory?: { usedJSHeapSize: number } }
            ).memory;
            return (
                `geo=${memory.geometries ?? '?'} tex=${memory.textures ?? '?'}` +
                ` calls=${render.drawCalls ?? render.calls ?? '?'}` +
                ` tris=${render.triangles ?? '?'} sections=${registrySize()}` +
                ` heap=${heap ? Math.round(heap.usedJSHeapSize / 1048576) + 'MB' : '?'}`
            );
        };

        // Heartbeat: the trend matters more than any single spike — does the
        // frame rate decay across the whole run, or fall off a cliff when a
        // particular scene arrives?
        if (frameWindow.current.frames >= HEARTBEAT) {
            const avg = frameWindow.current.ms / frameWindow.current.frames;
            console.info(
                `[fps] ${(1000 / avg).toFixed(1)}fps (${avg.toFixed(0)}ms avg)` +
                    ` z=${z} sector=${state.level + 1} ${stats()}`,
            );
            frameWindow.current = { frames: 0, ms: 0 };
        }

        if (ms < STALL_MS || frame.current < 30) return;

        worst.current = Math.max(worst.current, ms);

        console.warn(
            `[stall] ${Math.round(ms)}ms at z=${z} sector=${state.level + 1}` +
                ` | ${stats()} worst=${Math.round(worst.current)}ms`,
            events.current.map(e => `${e.what}@${e.z}`).join(' '),
        );
    });

    return null;
};

export default StallWatch;
