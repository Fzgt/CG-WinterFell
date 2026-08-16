/**
 * WebGPU resource-leak probe.
 *
 * Counts live GPU buffers and textures while a single run streams, by wrapping
 * the device's own create/destroy calls before any page script runs. A scene
 * that recycles what it builds holds a flat count however far the craft flies;
 * a climbing count is memory the run never gets back, and it is invisible to
 * both the JS heap and Chrome's task manager.
 *
 *   node bench/leak.mjs                        # against http://localhost:4173
 *   node bench/leak.mjs --seconds 90           # longer window
 *
 * Needs a served build (npm run preview) and playwright.
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const BASE_URL = getArg('url', 'http://localhost:4173');
const SECONDS = Number(getArg('seconds', 75));
const STEP_MS = Number(getArg('step', 5000));
const SETTLE_MS = 6000;

const { chromium } = await import('playwright');

/**
 * Wrapping the prototypes, not the device: three creates its device inside
 * `renderer.init()`, long before anything on the page is reachable from here.
 */
const INSTRUMENT = () => {
    const stats = {
        buffersCreated: 0,
        buffersDestroyed: 0,
        texturesCreated: 0,
        texturesDestroyed: 0,
    };
    window.__gpuStats = stats;
    if (!navigator.gpu) return;

    const patch = (proto, method, onCall) => {
        const original = proto[method];
        proto[method] = function (...callArgs) {
            const result = original.apply(this, callArgs);
            onCall(result);
            return result;
        };
    };

    const countDestroy = (proto, key) => {
        const original = proto.destroy;
        // Destroying twice frees nothing the second time, so only the first
        // call may be counted or the tally can go negative.
        proto.destroy = function () {
            if (!this.__counted) {
                this.__counted = true;
                stats[key]++;
            }
            return original.apply(this);
        };
    };

    // Live buffers grouped by what they are for, so a leak can be traced to a
    // kind of resource (vertex data, uniforms, staging) rather than a count.
    const live = new Map();
    window.__gpuLive = live;
    const describe = descriptor => {
        const u = descriptor.usage ?? 0;
        const kind =
            u & 32 ? 'vertex' : u & 16 ? 'index' : u & 64 ? 'uniform' : u & 128 ? 'storage' : 'other';
        return `${kind} ${descriptor.label || ''}`.trim();
    };

    const originalCreateBuffer = GPUDevice.prototype.createBuffer;
    GPUDevice.prototype.createBuffer = function (descriptor) {
        const buffer = originalCreateBuffer.call(this, descriptor);
        stats.buffersCreated++;
        const key = describe(descriptor);
        buffer.__kind = key;
        live.set(key, (live.get(key) ?? 0) + 1);
        return buffer;
    };
    const originalBufferDestroy = GPUBuffer.prototype.destroy;
    GPUBuffer.prototype.destroy = function () {
        if (!this.__released) {
            this.__released = true;
            if (this.__kind) live.set(this.__kind, (live.get(this.__kind) ?? 0) - 1);
        }
        return originalBufferDestroy.call(this);
    };

    patch(GPUDevice.prototype, 'createTexture', () => stats.texturesCreated++);
    countDestroy(GPUBuffer.prototype, 'buffersDestroyed');
    countDestroy(GPUTexture.prototype, 'texturesDestroyed');
};

const browser = await chromium.launch({
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
    ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(INSTRUMENT);

const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});

const FLAGS = getArg('flags', 'perf=1&immortal=1');
await page.goto(`${BASE_URL}/?${FLAGS}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.start-button', { timeout: 60000 });
await page.click('.start-button');
await page.waitForFunction(() => !!window.__bench, null, { timeout: 60000 });

const backend = await page.evaluate(() => !!navigator.gpu);
if (!backend) {
    console.error('no WebGPU in this browser — the numbers below would be WebGL');
    await browser.close();
    process.exit(1);
}

await page.waitForTimeout(SETTLE_MS);

/**
 * Resident memory of Chromium's GPU process.
 *
 * Counting create/destroy calls only proves whether the page released a
 * handle; three drops its uniform buffers on the floor rather than destroying
 * them, and a dropped handle may still be reclaimed by the collector. The GPU
 * process's own footprint is the number that decides whether any of it
 * actually costs the machine anything.
 */
const { execSync } = await import('node:child_process');
const gpuProcessRssMB = () => {
    try {
        const out = execSync(
            "ps -ax -o pid=,rss=,command= | grep -- '--type=gpu-process' | grep -i chromium | grep -v grep",
            { encoding: 'utf8' },
        ).trim().split('\n')[0];
        if (!out) return 0;
        return Math.round(Number(out.trim().split(/\s+/)[1]) / 1024);
    } catch {
        return 0;
    }
};

const sample = () =>
    page.evaluate(() => {
        const s = window.__gpuStats;
        const last = window.__bench?.samples.at(-1);
        return {
            z: Math.round(Math.abs(last?.z ?? 0)),
            liveBuffers: s.buffersCreated - s.buffersDestroyed,
            liveTextures: s.texturesCreated - s.texturesDestroyed,
            created: s.buffersCreated,
            destroyed: s.buffersDestroyed,
            heapMB: Number(
                (performance.memory?.usedJSHeapSize / 1048576 || 0).toFixed(1),
            ),
        };
    });

const withRss = async () => ({ ...(await sample()), gpuMB: gpuProcessRssMB() });
const rows = [await withRss()];
const steps = Math.floor((SECONDS * 1000) / STEP_MS);
for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(STEP_MS);
    rows.push(await withRss());
}

/**
 * A buffer whose JS wrapper has been collected is freed by the browser without
 * anyone calling `destroy()`, and the counters above cannot tell that apart
 * from a genuine leak. Forcing a collection and re-reading settles it: a count
 * that does not move is memory something still holds a reference to.
 */
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(2000);
const afterGC = await withRss();
const bench = await page.evaluate(() => window.__bench.report());
const byKind = await page.evaluate(() =>
    [...window.__gpuLive.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
);

await browser.close();

console.log('\n# WebGPU live-resource count over one run\n');
console.log('| distance (m) | live buffers | live textures | created | destroyed | JS heap | GPU proc |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
    console.log(
        `| ${r.z} | ${r.liveBuffers} | ${r.liveTextures} | ${r.created} | ${r.destroyed} | ${r.heapMB} MB | ${r.gpuMB} MB |`,
    );
}

console.log(
    `| after forced GC | ${afterGC.liveBuffers} | ${afterGC.liveTextures} | ${afterGC.created} | ${afterGC.destroyed} | ${afterGC.heapMB} MB | ${afterGC.gpuMB} MB |`,
);

const first = rows[0];
const last = rows[rows.length - 1];
const metres = last.z - first.z;
console.log(
    `\nbuffers ${first.liveBuffers} -> ${last.liveBuffers} ` +
        `(${last.liveBuffers - first.liveBuffers > 0 ? '+' : ''}` +
        `${last.liveBuffers - first.liveBuffers}) over ${metres} m`,
);
if (metres > 0) {
    console.log(
        `leak rate: ${(((last.liveBuffers - first.liveBuffers) / metres) * 1000).toFixed(1)} buffers per 1000 m`,
    );
}
console.log(
    `\nframes: ${bench.samples} sampled, mean ${(1000 / bench.frameMs.mean).toFixed(0)} fps, ` +
        `p95 frame ${bench.frameMs.p95.toFixed(1)} ms\n` +
        `stalls (> threshold): ${bench.stalls}, total ${bench.stallSec}s, worst ${bench.worstStallMs} ms`,
);
console.log('\nlive buffers by kind:');
for (const [kind, n] of byKind) console.log(`  ${n}\t${kind}`);
if (errors.length) {
    console.log(`\nerrors (${errors.length}):`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.log(`  ${e}`);
}
