/**
 * Benchmark hooks. Everything here is opt-in through URL flags, so a normal
 * visit to the site behaves exactly as before:
 *
 *   ?perf=1             collect frame stats into window.__bench
 *   ?renderer=webgl     force the WebGL path even when WebGPU is available
 *   ?instancing=off     draw pumpkins as individual meshes instead of an
 *                       InstancedMesh (the naive baseline to compare against)
 *   ?immortal=1         ignore pumpkin collisions, so a run keeps streaming
 *                       for the whole measurement window
 *
 * See bench/run.mjs for the driver that reads these.
 */

const params =
    typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);

export const benchFlags = {
    perf: params.has('perf'),
    forceWebGL: params.get('renderer') === 'webgl',
    instancing: params.get('instancing') !== 'off',
    immortal: params.has('immortal'),
};

export interface BenchSample {
    t: number;
    frameMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    /**
     * Player's world Z. Recorded so a run can prove the world actually
     * streamed while it was measured — a flat draw-call count means nothing
     * if the player never moved.
     */
    z: number;
}

const quantile = (sorted: number[], q: number) => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1];
    return next === undefined
        ? sorted[base]
        : sorted[base] + rest * (next - sorted[base]);
};

const summarise = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return {
        mean: sorted.length ? sum / sorted.length : 0,
        p50: quantile(sorted, 0.5),
        p95: quantile(sorted, 0.95),
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
    };
};

class Bench {
    samples: BenchSample[] = [];

    /**
     * Which renderer actually ended up being used. Reported by the probe from
     * the live renderer rather than inferred from the flags, so a WebGPU init
     * that silently fell back can't be mistaken for a WebGPU result.
     */
    renderer = 'unknown';

    /** Discard everything collected so far — call once the scene has settled. */
    reset() {
        this.samples = [];
    }

    push(sample: BenchSample) {
        this.samples.push(sample);
    }

    /**
     * Frame stats plus a coarse draw-call series. The series is the evidence
     * for bounded streaming: it should stay flat however far the player runs,
     * rather than climbing as sections accumulate.
     */
    report(seriesBuckets = 12) {
        const { samples } = this;
        if (!samples.length) return { samples: 0 };

        const frameMs = samples.map(s => s.frameMs);
        const drawCalls = samples.map(s => s.drawCalls);
        const spanMs = samples[samples.length - 1].t - samples[0].t;

        const bucketSize = Math.ceil(samples.length / seriesBuckets);
        const series: { atSec: number; drawCalls: number; triangles: number }[] = [];
        for (let i = 0; i < samples.length; i += bucketSize) {
            const chunk = samples.slice(i, i + bucketSize);
            const avg = (get: (s: BenchSample) => number) =>
                Math.round(chunk.reduce((a, s) => a + get(s), 0) / chunk.length);
            series.push({
                atSec: Number(((chunk[0].t - samples[0].t) / 1000).toFixed(1)),
                drawCalls: avg(s => s.drawCalls),
                triangles: avg(s => s.triangles),
            });
        }

        const last = samples[samples.length - 1];
        return {
            renderer: this.renderer,
            samples: samples.length,
            durationSec: Number((spanMs / 1000).toFixed(1)),
            distanceTravelled: Math.round(Math.abs(last.z - samples[0].z)),
            frameMs: summarise(frameMs),
            fps: {
                mean: 1000 / summarise(frameMs).mean,
                p50: 1000 / summarise(frameMs).p50,
                // A p95 frame time is a worst case, so it maps to a low FPS.
                p05: 1000 / summarise(frameMs).p95,
            },
            drawCalls: summarise(drawCalls),
            triangles: summarise(samples.map(s => s.triangles)),
            geometries: last.geometries,
            textures: last.textures,
            series,
        };
    }
}

declare global {
    interface Window {
        __bench?: Bench;
    }
}

export const getBench = () => {
    if (!window.__bench) window.__bench = new Bench();
    return window.__bench;
};
