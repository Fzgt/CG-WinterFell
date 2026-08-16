/**
 * Hunt a reproducible hitch at a given distance.
 *
 * Plays one long run and keeps every frame's (z, frameMs), then reports the
 * worst frames bucketed by distance. Stalls are recovered from the gap in
 * sample timestamps rather than window.__bench.stalls, because that array
 * drops the position and a hitch with no distance attached is useless here.
 *
 *   node bench/jank.mjs --url https://cg-winter-fell.vercel.app --metres 600
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const BASE_URL = getArg('url', 'http://localhost:5173');
const TARGET_M = Number(getArg('metres', 600));
const WIDTH = Number(getArg('width', 2560));
const HEIGHT = Number(getArg('height', 1440));
const BUCKET_M = Number(getArg('bucket', 20));

const { chromium } = await import('playwright');

const browser = await chromium.launch({
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
    ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

// immortal=1 so a collision can't end the run before the window of interest.
await page.goto(`${BASE_URL}/?perf=1&immortal=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.start-button', { timeout: 60000 });
await page.click('.start-button');
await page.waitForFunction(() => !!window.__bench, null, { timeout: 60000 });

// Throw away load-time frames: the first seconds are model upload and warmup,
// not the steady state the hitch is supposed to sit in.
await page.waitForTimeout(6000);
await page.evaluate(() => window.__bench.reset());

const targetZ = TARGET_M * 10;
process.stderr.write(`playing to ${TARGET_M} m ...\n`);
let lastLogged = 0;
for (;;) {
    const z = await page.evaluate(() => {
        const s = window.__bench.samples;
        return s.length ? Math.abs(s[s.length - 1].z) : 0;
    });
    if (z >= targetZ) break;
    const m = Math.floor(z / 10);
    if (m - lastLogged >= 100) {
        lastLogged = m;
        process.stderr.write(`  ${m} m\n`);
    }
    await page.waitForTimeout(2000);
}

const samples = await page.evaluate(() =>
    window.__bench.samples.map(s => [s.t, s.frameMs, s.z]),
);
const report = await page.evaluate(() => window.__bench.report());
await browser.close();

// A frame routed into `stalls` never reaches `samples`, so its cost shows up
// as a hole in the timestamps. Reconstruct the real per-frame cost from the
// gap and keep the distance it happened at.
const frames = [];
for (let i = 1; i < samples.length; i += 1) {
    const [t, frameMs, z] = samples[i];
    const gap = t - samples[i - 1][0];
    frames.push({ m: Math.abs(z) / 10, ms: Math.max(frameMs, gap) });
}

const buckets = new Map();
for (const f of frames) {
    const key = Math.floor(f.m / BUCKET_M) * BUCKET_M;
    const b = buckets.get(key) ?? { n: 0, sum: 0, max: 0, over32: 0 };
    b.n += 1;
    b.sum += f.ms;
    b.max = Math.max(b.max, f.ms);
    if (f.ms > 32) b.over32 += 1;
    buckets.set(key, b);
}

console.log(`\n# jank sweep · ${BASE_URL} · ${frames.length} frames to ${TARGET_M} m`);
console.log(`renderer ${report.renderer} · frame p50 ${report.frameMs.p50.toFixed(2)} ms · p95 ${report.frameMs.p95.toFixed(2)} ms`);
console.log(`\n| from m | frames | mean ms | worst ms | frames >32ms |`);
console.log(`| --- | --- | --- | --- | --- |`);
for (const [m, b] of [...buckets].sort((a, c) => a[0] - c[0])) {
    console.log(
        `| ${m} | ${b.n} | ${(b.sum / b.n).toFixed(2)} | ${b.max.toFixed(1)} | ${b.over32} |`,
    );
}

console.log(`\nworst 25 frames:`);
for (const f of [...frames].sort((a, b) => b.ms - a.ms).slice(0, 25)) {
    console.log(`  ${f.ms.toFixed(1)} ms at ${f.m.toFixed(0)} m`);
}
