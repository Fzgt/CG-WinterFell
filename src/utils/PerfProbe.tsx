import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getBench } from './bench';
import { useStore } from '../store/store';
import { registrySize } from './obstacleRegistry';

/**
 * Samples renderer stats once per frame into window.__bench. Mounted only
 * under ?perf=1 (see Game.tsx), so it costs nothing on a normal visit.
 *
 * Counting draw calls per frame across both renderers takes some care:
 *
 *  - WebGLRenderer's info.render.calls is the draw-call count for one frame.
 *  - WebGPURenderer's info.render.calls is instead a *cumulative* count of
 *    render() invocations since startup; its per-frame draw calls live in
 *    info.render.drawCalls. It also renders asynchronously, so its automatic
 *    per-frame reset does not reliably land before this callback reads it.
 *
 * So autoReset is switched off and the counters are reset here right after
 * sampling. Each read then covers exactly one frame's worth of rendering on
 * either backend, which makes the two directly comparable.
 */
/** A frame at or above this is treated as a stall, not a slow frame. */
const STALL_MS = 250;

const PerfProbe = () => {
    const gl = useThree(state => state.gl);
    const last = useRef(performance.now());
    const configured = useRef(false);

    useFrame(() => {
        const info = (gl as unknown as { info?: any }).info;
        if (!info) return;

        const bench = getBench();

        if (!configured.current) {
            configured.current = true;
            info.autoReset = false;
            const r = gl as unknown as { isWebGPURenderer?: boolean };
            bench.renderer = r.isWebGPURenderer
                ? 'WebGPU'
                : (gl?.constructor?.name ?? 'unknown');
        }

        const now = performance.now();
        const frameMs = now - last.current;
        last.current = now;

        const render = info.render ?? {};
        const memory = info.memory ?? {};

        // Long frames are recorded separately rather than dropped. Silently
        // discarding them made a software-rendered run that was spending
        // seconds per frame report a steady 120fps, because only the handful
        // of fast frames survived the filter.
        if (frameMs >= STALL_MS) {
            bench.stalls.push(frameMs);
        } else if (frameMs > 0) {
            bench.push({
                t: now,
                frameMs,
                drawCalls: render.drawCalls ?? render.calls ?? 0,
                triangles: render.triangles ?? 0,
                geometries: memory.geometries ?? 0,
                textures: memory.textures ?? 0,
                // getState() rather than a subscription: this must not cause
                // re-renders inside the loop it is measuring.
                z: useStore.getState().playerPosition[2],
                registrySections: registrySize(),
            });
        }

        info.reset?.();
    });

    return null;
};

export default PerfProbe;
