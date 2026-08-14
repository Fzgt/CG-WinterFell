/**
 * WinterFell render benchmark.
 *
 * Loads the game in headless Chromium, plays it for a fixed window while
 * holding a movement key, and samples renderer stats every frame (see
 * src/utils/PerfProbe.tsx). Runs several scenarios so the numbers are
 * comparisons rather than isolated figures.
 *
 *   node bench/run.mjs                      # against http://localhost:5173
 *   node bench/run.mjs --url https://...    # against a deployed build
 *   node bench/run.mjs --seconds 30         # longer sampling window
 *
 * Needs playwright: npm i -D playwright && npx playwright install chromium
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const BASE_URL = getArg('url', 'http://localhost:5173');
const SECONDS = Number(getArg('seconds', 20));
// Headless Chromium paces frames to the compositor (~120 fps here), so at a
// small viewport every scenario pins to the cap and FPS tells you nothing.
// Render at a higher resolution to make the GPU the bottleneck; draw calls
// and triangles stay meaningful either way.
const WIDTH = Number(getArg('width', 2560));
const HEIGHT = Number(getArg('height', 1440));
const SETTLE_MS = 6000; // let models load and the scene reach steady state

const SCENARIOS = [
    { name: 'WebGPU + instancing', flags: 'perf=1&immortal=1' },
    { name: 'WebGPU, no instancing', flags: 'perf=1&immortal=1&instancing=off' },
    { name: 'WebGL + instancing', flags: 'perf=1&immortal=1&renderer=webgl' },
    {
        name: 'WebGL, no instancing',
        flags: 'perf=1&immortal=1&renderer=webgl&instancing=off',
    },
];

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.error(
        'playwright not found. Install it first:\n' +
            '  npm i -D playwright && npx playwright install chromium',
    );
    process.exit(1);
}

const round = n => Math.round(n * 10) / 10;

const runScenario = async (browser, scenario) => {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    const url = `${BASE_URL}/?${scenario.flags}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // The welcome screen gates the game; start it.
    await page.waitForSelector('.start-button', { timeout: 60000 });
    await page.click('.start-button');

    // Wait for the probe to exist, i.e. the Canvas is up and rendering.
    await page.waitForFunction(() => !!window.__bench, null, { timeout: 60000 });
    await page.waitForTimeout(SETTLE_MS);

    // Steady state reached — throw away load-time frames, then play.
    await page.evaluate(() => window.__bench.reset());
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout((SECONDS * 1000) / 2);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout((SECONDS * 1000) / 2);
    await page.keyboard.up('ArrowRight');

    const report = await page.evaluate(() => window.__bench.report());
    // Headless Chromium usually has no GPU for WebGL and quietly falls back to
    // SwiftShader. Software-rasterising this scene takes seconds per frame, so
    // any timing measured that way says nothing about real hardware.
    const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    await page.close();
    return { ...scenario, report, gpu };
};

const browser = await chromium.launch({
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
    ],
});

const results = [];
for (const scenario of SCENARIOS) {
    process.stderr.write(`running: ${scenario.name} ... `);
    try {
        const r = await runScenario(browser, scenario);
        results.push(r);
        process.stderr.write(
            `${round(r.report.fps?.mean ?? 0)} fps avg, ` +
                `${Math.round(r.report.drawCalls?.mean ?? 0)} draw calls\n`,
        );
    } catch (err) {
        process.stderr.write(`FAILED (${err.message})\n`);
        results.push({ ...scenario, error: err.message });
    }
}
await browser.close();

const ok = results.filter(r => r.report?.samples);

console.log(`\n# WinterFell render benchmark`);
console.log(
    `\n${BASE_URL} · ${SECONDS}s sampled per scenario · headless Chromium ${WIDTH}x${HEIGHT}`,
);

const capped = ok.filter(r => r.report.fps.p50 > 115);
if (capped.length) {
    console.log(
        `\n> Note: ${capped.length}/${ok.length} scenarios sit at the compositor's` +
            ` frame cap (~120 fps), so FPS does not separate them — the GPU still has` +
            ` headroom at this resolution. Compare draw calls and triangles instead,` +
            ` or re-run with a larger --width/--height.`,
    );
}
console.log(`\n| Scenario | Renderer used | FPS avg | Frame p95 | Stalls | Draw calls | Triangles |`);
console.log(`| --- | --- | --- | --- | --- | --- | --- |`);
for (const r of ok) {
    const s = r.report;
    const stalls = s.stalls
        ? `${s.stalls} (${s.stallSec}s, worst ${s.worstStallMs}ms)`
        : 'none';
    console.log(
        `| ${r.name} | ${s.renderer} | ${round(s.fps.mean)} | ${round(s.frameMs.p95)} ms ` +
            `| ${stalls} | ${Math.round(s.drawCalls.mean)} ` +
            `| ${Math.round(s.triangles.mean).toLocaleString()} |`,
    );
}

const software = ok.filter(r => /swiftshader|llvmpipe|software/i.test(r.gpu ?? ''));
if (software.length) {
    console.log(
        `\n> WARNING: WebGL here is ${software[0].gpu} — software rasterisation, not a GPU.` +
            ` Draw-call and triangle counts are CPU-side and still valid, but any frame` +
            ` timing from a WebGL row is meaningless for real hardware. Compare timings` +
            ` only within the same backend, or run the benchmark against a real browser.`,
    );
}

const stalled = ok.filter(r => (r.report.stallSec ?? 0) > r.report.durationSec * 0.2);
if (stalled.length) {
    console.log(
        `\n> WARNING: ${stalled.map(r => r.name).join(', ')} spent over a fifth of the` +
            ` window stalled. The FPS column only covers frames under 250ms, so treat it` +
            ` as "speed while it was actually running", not throughput.`,
    );
}

// Instancing does not just trade draw calls for nothing: an InstancedMesh is
// one object with one bounding volume, so per-instance frustum culling is
// lost and the whole section gets submitted whenever any part of it is
// visible. If the triangle counts between the two paths differ a lot, the
// draw-call win is not free and the comparison should say so out loud.
const instanced = ok.find(r => !r.flags.includes('instancing=off'));
const naive = ok.find(r => r.flags.includes('instancing=off'));
if (instanced && naive) {
    const tInst = instanced.report.triangles.mean;
    const tNaive = naive.report.triangles.mean;
    const ratio = tNaive ? tInst / tNaive : 1;
    const callRatio = instanced.report.drawCalls.mean
        ? naive.report.drawCalls.mean / instanced.report.drawCalls.mean
        : 1;
    console.log(`\n## What instancing actually bought\n`);
    console.log(
        `Draw calls: ${Math.round(naive.report.drawCalls.mean)} -> ` +
            `${Math.round(instanced.report.drawCalls.mean)} (${round(callRatio)}x fewer).`,
    );
    if (Math.abs(ratio - 1) > 0.15) {
        console.log(
            `\nBut triangles submitted went ${Math.round(tNaive).toLocaleString()} -> ` +
                `${Math.round(tInst).toLocaleString()} (${round(ratio)}x). Individual meshes ` +
                `are frustum-culled one by one; an InstancedMesh is a single object, so an ` +
                `entire section is submitted whenever any of it is on screen. The draw-call ` +
                `reduction is real, but it is a trade against per-object culling — not a ` +
                `free speedup, and this scene is not draw-call bound on a desktop GPU.`,
        );
    }
}

// Bounded-streaming evidence: draw calls over time for the default scenario.
const baseline = ok[0];
if (baseline?.report.series) {
    console.log(
        `\n## Draw calls over ${baseline.report.durationSec}s of continuous play (${baseline.name})`,
    );
    console.log(`\n| t (s) | Draw calls | Triangles |`);
    console.log(`| --- | --- | --- |`);
    for (const p of baseline.report.series) {
        console.log(`| ${p.atSec} | ${p.drawCalls} | ${p.triangles.toLocaleString()} |`);
    }
    const calls = baseline.report.series.map(p => p.drawCalls);
    console.log(
        `\nRange over the window: ${Math.min(...calls)}–${Math.max(...calls)} draw calls ` +
            `(geometries held at ${baseline.report.geometries}, textures ${baseline.report.textures}), ` +
            `while the player covered ${baseline.report.distanceTravelled.toLocaleString()} world units ` +
            `(~${Math.round(baseline.report.distanceTravelled / 2000)} sections). ` +
            `Constant cost over a growing distance is the streaming working: ` +
            `sections are recycled ahead of the player rather than accumulating.`,
    );
    if (baseline.report.distanceTravelled < 1000) {
        console.log(
            `\n> WARNING: the player barely moved during sampling, so the flat` +
                ` draw-call count proves nothing. Check that the game actually` +
                ` started and was not paused.`,
        );
    }
}

const failed = results.filter(r => r.error);
if (failed.length) {
    console.log(`\n## Failed scenarios\n`);
    for (const f of failed) console.log(`- ${f.name}: ${f.error}`);
}
