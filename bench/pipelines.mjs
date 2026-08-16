/**
 * Render-pipeline compilation probe.
 *
 * A long frame in a scene that is already streaming smoothly usually means the
 * GPU had to build something new mid-run, not that memory ran out. WebGPU
 * compiles a render pipeline the first time a material/geometry combination is
 * drawn, and that compile happens on the frame that needs it.
 *
 * This wraps the device's pipeline creation and records, per frame, how many
 * pipelines were built and how long the frame took. If the slow frames are the
 * frames that compiled, the hitch is shader compilation.
 *
 *   node bench/pipelines.mjs --seconds 150
 *
 * Needs a served build (npm run preview) and playwright.
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const BASE_URL = getArg('url', 'http://localhost:4173');
const SECONDS = Number(getArg('seconds', 150));
const SETTLE_MS = 6000;

const { chromium } = await import('playwright');

const INSTRUMENT = () => {
    const frames = [];
    const pipelines = [];
    window.__pipeProbe = { frames, pipelines };

    let pending = 0;
    const wrap = (method) => {
        const original = GPUDevice.prototype[method];
        if (!original) return;
        GPUDevice.prototype[method] = function (descriptor) {
            const t0 = performance.now();
            const result = original.call(this, descriptor);
            pending++;
            pipelines.push({
                t: t0,
                ms: performance.now() - t0,
                label: descriptor?.label ?? '',
                method,
            });
            return result;
        };
    };
    wrap('createRenderPipeline');
    wrap('createRenderPipelineAsync');
    wrap('createComputePipeline');

    // Frame timing measured from the same clock as the pipeline stamps, so a
    // long frame can be matched against what was compiled inside it.
    let last = performance.now();
    const tick = () => {
        const now = performance.now();
        frames.push({ t: now, ms: now - last, built: pending });
        pending = 0;
        last = now;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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

const gpuErrors = [];
page.on('console', m => {
    if (m.type() === 'error') gpuErrors.push({ t: Date.now(), text: m.text().slice(0, 160) });
});

await page.goto(`${BASE_URL}/?${getArg('flags', 'perf=1&immortal=1')}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForSelector('.start-button', { timeout: 60000 });
await page.click('.start-button');
await page.waitForFunction(() => !!window.__bench, null, { timeout: 60000 });
await page.waitForTimeout(SETTLE_MS);
await page.evaluate(() => window.__bench.reset());

await page.waitForTimeout(SECONDS * 1000);

const out = await page.evaluate(() => {
    const { frames, pipelines } = window.__pipeProbe;
    const sorted = [...frames.map(f => f.ms)].sort((a, b) => a - b);
    const q = p => sorted[Math.floor((sorted.length - 1) * p)];
    const slow = frames
        .filter(f => f.ms > 50)
        .map(f => ({ atSec: Number((f.t / 1000).toFixed(1)), ms: Math.round(f.ms), built: f.built }));
    const compiling = frames.filter(f => f.built > 0);
    return {
        report: window.__bench.report(),
        textures: window.__bench.samples.at(-1)?.textures ?? 0,
        frameCount: frames.length,
        p50: Math.round(q(0.5) * 10) / 10,
        p95: Math.round(q(0.95) * 10) / 10,
        p99: Math.round(q(0.99) * 10) / 10,
        max: Math.round(sorted[sorted.length - 1]),
        pipelineCount: pipelines.length,
        pipelineTotalMs: Math.round(pipelines.reduce((a, p) => a + p.ms, 0)),
        lastPipelineAtSec: pipelines.length
            ? Number((pipelines.at(-1).t / 1000).toFixed(1))
            : 0,
        framesThatCompiled: compiling.length,
        compileFrameMsMean:
            compiling.length
                ? Math.round(compiling.reduce((a, f) => a + f.ms, 0) / compiling.length)
                : 0,
        slow: slow.slice(0, 40),
        // Texture growth: sampled by the in-page probe every frame.
        textureSeries: (() => {
            const s = window.__bench.samples;
            const step = Math.max(1, Math.floor(s.length / 10));
            const rows = [];
            for (let i = 0; i < s.length; i += step) {
                rows.push({
                    atSec: Number(((s[i].t - s[0].t) / 1000).toFixed(0)),
                    textures: s[i].textures,
                    geometries: s[i].geometries,
                });
            }
            return rows;
        })(),
    };
});

await browser.close();

console.log(JSON.stringify({ ...out, gpuErrors: gpuErrors.slice(0, 10) }, null, 2));
