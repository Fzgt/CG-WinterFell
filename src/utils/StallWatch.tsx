import { useRef } from 'react';
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

interface Event {
    what: string;
    z: number;
    atFrame: number;
}

const StallWatch = () => {
    const gl = useThree(state => state.gl);
    const last = useRef(performance.now());
    const frame = useRef(0);
    const events = useRef<Event[]>([]);
    const seen = useRef({ level: -1, tile: -1, section: -1 });
    const worst = useRef(0);
    const window = useRef({ frames: 0, ms: 0 });

    useFrame(() => {
        const now = performance.now();
        const ms = now - last.current;
        last.current = now;
        frame.current += 1;

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

        window.current.frames += 1;
        window.current.ms += ms;

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
        if (window.current.frames >= HEARTBEAT) {
            const avg = window.current.ms / window.current.frames;
            console.info(
                `[fps] ${(1000 / avg).toFixed(1)}fps (${avg.toFixed(0)}ms avg)` +
                    ` z=${z} sector=${state.level + 1} ${stats()}`,
            );
            window.current = { frames: 0, ms: 0 };
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
