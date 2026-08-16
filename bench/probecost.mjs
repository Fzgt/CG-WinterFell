/**
 * Does ?perf=1 change how the game runs?
 *
 * The in-page probe can't answer this: it only exists under ?perf=1, so
 * asking it to compare the two is asking a witness about a room it was never
 * in. This driver times frames from outside the app instead — a
 * requestAnimationFrame chain installed before any application code runs, so
 * the identical measurement is taken on both URLs.
 *
 *   npm run preview
 *   node bench/probecost.mjs [--seconds 90] [--url http://localhost:4173]
 */

const args = process.argv.slice(2);
const getArg = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? d : args[i + 1];
};
const SECONDS = Number(getArg('seconds', 90));
const BASE_URL = getArg('url', 'http://localhost:4173');
const SETTLE_MS = 4000;

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.error('playwright not found: npm i -D playwright');
    process.exit(1);
}

/**
 * Frame timing that does not depend on the app. Runs its own rAF chain, which
 * the compositor drives on the same schedule as the render loop, so a frame
 * the page misses shows up here as a long interval.
 */
const TIMER = () => {
    window.__ext = { frames: [], started: 0 };
    let last = 0;
    const tick = now => {
        if (last) window.__ext.frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

const quantile = (sorted, q) => {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1];
    return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
};

const browser = await chromium.launch({
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
    ],
});

const measure = async flags => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript(TIMER);
    await page.goto(`${BASE_URL}/?${flags}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.start-button', { timeout: 60000 });
    await page.click('.start-button');
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => (window.__ext.frames.length = 0));
    await page.waitForTimeout(SECONDS * 1000);
    const frames = await page.evaluate(() => window.__ext.frames);
    await page.close();

    const sorted = [...frames].sort((a, b) => a - b);
    const stalls = frames.filter(f => f >= 250);
    const slow = frames.filter(f => f >= 33);
    return {
        flags,
        frames: frames.length,
        mean: Number((frames.reduce((a, v) => a + v, 0) / frames.length).toFixed(2)),
        p50: Number(quantile(sorted, 0.5).toFixed(2)),
        p95: Number(quantile(sorted, 0.95).toFixed(2)),
        p99: Number(quantile(sorted, 0.99).toFixed(2)),
        max: Number(sorted[sorted.length - 1].toFixed(1)),
        slowFrames: slow.length,
        stalls: stalls.length,
        stallSec: Number((stalls.reduce((a, v) => a + v, 0) / 1000).toFixed(2)),
    };
};

// Interleaved so a warming machine can't be mistaken for a flag effect.
const rounds = [];
for (let i = 0; i < Number(getArg('rounds', 2)); i++) {
    rounds.push(await measure('immortal=1'));
    rounds.push(await measure('perf=1&immortal=1'));
}

console.table(rounds);
await browser.close();
