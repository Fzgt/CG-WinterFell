/**
 * "Vertex buffer slot N was not set" — missing attribute, or freed mid-draw?
 *
 * Two explanations fit the error text and they call for opposite fixes:
 *
 *   A. The geometry never had the attribute slot 1 wants (a hand-built
 *      BufferGeometry with no uv). Then the pipeline is broken by
 *      construction and *every* draw that uses it fails, from the first
 *      frame it appears until the mesh leaves the scene.
 *
 *   B. The buffer was destroyed while a frame that still referenced it was in
 *      flight. Then failures are rare, and each one lands next to a
 *      GPUBuffer.destroy().
 *
 * The two are told apart by when the errors happen, not by what they say. So
 * this stamps every uncaptured error and every buffer destroy on one clock
 * and reports the gap between each error and the destroy before it, plus the
 * vertex layout of the pipeline that failed.
 *
 *   npm run preview
 *   node bench/vberror.mjs [--seconds 200]
 */

const args = process.argv.slice(2);
const getArg = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? d : args[i + 1];
};
const BASE_URL = getArg('url', 'http://localhost:4173');
const SECONDS = Number(getArg('seconds', 200));
const SETTLE_MS = 5000;

const { chromium } = await import('playwright');

const INSTRUMENT = () => {
    const errors = [];
    const destroys = [];
    const layouts = {};
    window.__vb = { errors, destroys, layouts };

    // Vertex layout per pipeline label, so a failing pipeline can be asked
    // what it wanted in slot 1 rather than guessed at.
    const origPipeline = GPUDevice.prototype.createRenderPipeline;
    GPUDevice.prototype.createRenderPipeline = function (desc) {
        const label = desc?.label ?? '';
        layouts[label] = (desc?.vertex?.buffers ?? []).map((b, i) => ({
            slot: i,
            stride: b?.arrayStride,
            attrs: (b?.attributes ?? []).map(a => a.shaderLocation),
        }));
        return origPipeline.call(this, desc);
    };

    const origDestroy = GPUBuffer.prototype.destroy;
    GPUBuffer.prototype.destroy = function () {
        destroys.push({ t: performance.now(), size: this.size });
        return origDestroy.call(this);
    };

    // three requests the device itself; wrap the adapter so the handler is
    // attached before any frame is encoded.
    const origRequest = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...a) {
        const device = await origRequest.apply(this, a);
        device.addEventListener('uncapturederror', e => {
            errors.push({ t: performance.now(), msg: String(e.error.message).slice(0, 300) });
        });
        return device;
    };
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
await page.goto(`${BASE_URL}/?perf=1&immortal=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.start-button', { timeout: 60000 });
await page.click('.start-button');
await page.waitForTimeout(SETTLE_MS);

const t0 = await page.evaluate(() => performance.now());
await page.waitForTimeout(SECONDS * 1000);

const out = await page.evaluate(start => {
    const { errors, destroys, layouts } = window.__vb;
    const after = errors.filter(e => e.t >= start);
    const rows = after.map(e => {
        const prior = destroys.filter(d => d.t <= e.t);
        const last = prior[prior.length - 1];
        // Destroys inside the 100ms before the error: a teardown burst.
        const burst = prior.filter(d => e.t - d.t < 100).length;
        const m = e.msg.match(/\[RenderPipeline '([^']+)'\]/);
        return {
            atSec: Number(((e.t - start) / 1000).toFixed(1)),
            sinceDestroyMs: last ? Number((e.t - last.t).toFixed(1)) : null,
            destroysWithin100ms: burst,
            pipeline: m ? m[1] : '',
            msg: e.msg.slice(0, 90),
        };
    });
    const failing = {};
    for (const r of rows) if (r.pipeline) failing[r.pipeline] = layouts[r.pipeline] ?? null;
    return {
        errorCount: after.length,
        destroyCount: destroys.filter(d => d.t >= start).length,
        rows: rows.slice(0, 40),
        failing,
        bench: window.__bench?.report?.(),
    };
}, t0);

console.log(`errors: ${out.errorCount} in ${SECONDS}s   buffer destroys: ${out.destroyCount}`);
console.table(out.rows);
console.log('vertex layout of failing pipelines:');
console.dir(out.failing, { depth: 5 });
console.log('drawCalls:', out.bench?.drawCalls, '\nframeMs:', out.bench?.frameMs);
console.log('stalls:', out.bench?.stalls, 'stallSec:', out.bench?.stallSec, 'distance:', out.bench?.distanceTravelled);

await browser.close();
