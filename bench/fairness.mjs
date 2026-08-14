/**
 * Obstacle-layout fairness check.
 *
 * Whether a run is winnable is a property of the layout, not of the renderer,
 * so this measures the layout directly instead of playtesting: it imports the
 * real generator through the Vite dev server and walks each section, asking at
 * every step whether a player travelling at the game's own speeds could still
 * be somewhere safe.
 *
 * Playtesting this in headless Chromium does not work — WebGL there falls back
 * to software rasterisation, frames take seconds, and the run either crawls or
 * (before delta clamping) teleported the player straight through the field.
 *
 *   npm run dev
 *   node bench/fairness.mjs [--sections 12] [--trials 40]
 */

const args = process.argv.slice(2);
const getArg = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i === -1 ? d : args[i + 1];
};
const SECTIONS = Number(getArg('sections', 12));
const TRIALS = Number(getArg('trials', 40));
const URL = getArg('url', 'http://localhost:5173');

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.error('playwright not found: npm i -D playwright');
    process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });

const results = await page.evaluate(
    async ({ sections, trials }) => {
        const mod = await import('/src/utils/generatePumpkins.ts');
        const cfg = await import('/src/config/pumpkin.ts');

        // The player's collision radius against a pumpkin, and how far it can
        // move sideways while covering one unit forward. Both come from the
        // game: PumpkinField uses radius 15, and usePlayerMovement moves
        // FIXED_LATERAL_SPEED (5) sideways against playerSpeed (12) forward.
        const HIT_RADIUS = 15;
        const LATERAL_PER_FORWARD = 5 / 12;
        const STEP = 10; // forward sampling resolution

        const out = [];
        for (let section = 0; section < sections; section++) {
            let blocked = 0;
            let tightest = Infinity;

            for (let t = 0; t < trials; t++) {
                const pumpkins = mod.generateSectionPumpkins(section, 0);
                const zs = pumpkins.map(p => p.z);
                const startZ = Math.max(...zs);
                const endZ = Math.min(...zs);

                // Reachable set of x positions, swept forward. Start anywhere,
                // widen by what the player could reach over each step, then
                // remove anything within HIT_RADIUS of a pumpkin.
                let reach = [[-cfg.FIELD_WIDTH / 2, cfg.FIELD_WIDTH / 2]];
                let deadAt = null;

                for (let z = startZ; z > endZ && !deadAt; z -= STEP) {
                    const grow = STEP * LATERAL_PER_FORWARD;
                    reach = reach.map(([a, b]) => [a - grow, b + grow]);

                    const near = pumpkins.filter(
                        p => p.z <= z && p.z > z - STEP,
                    );
                    for (const p of near) {
                        const next = [];
                        for (const [a, b] of reach) {
                            const lo = p.x - HIT_RADIUS;
                            const hi = p.x + HIT_RADIUS;
                            if (hi <= a || lo >= b) next.push([a, b]);
                            else {
                                if (lo > a) next.push([a, lo]);
                                if (hi < b) next.push([hi, b]);
                            }
                        }
                        reach = next;
                    }
                    // Merge overlaps. Growing every interval each step makes
                    // neighbours overlap, and splitting them around pumpkins
                    // without merging again lets the list grow exponentially.
                    reach = reach
                        .filter(([a, b]) => b - a > 0)
                        .sort((p, q) => p[0] - q[0])
                        .reduce((acc, cur) => {
                            const prev = acc[acc.length - 1];
                            if (prev && cur[0] <= prev[1]) {
                                prev[1] = Math.max(prev[1], cur[1]);
                            } else acc.push([...cur]);
                            return acc;
                        }, []);
                    const widest = reach.reduce((m, [a, b]) => Math.max(m, b - a), 0);
                    if (widest < tightest) tightest = widest;
                    if (!reach.length) deadAt = z;
                }

                if (deadAt !== null) blocked++;
            }

            const pumpkins = mod.generateSectionPumpkins(section, 0);
            out.push({
                section,
                pumpkins: pumpkins.length,
                blockedPct: Math.round((blocked / trials) * 100),
                tightestGap: Math.round(tightest),
            });
        }
        return out;
    },
    { sections: SECTIONS, trials: TRIALS },
);

await browser.close();

console.log(`\n# Obstacle-layout fairness (${TRIALS} generated layouts per section)\n`);
console.log('| Section | Pumpkins | Layouts with no way through | Tightest gap |');
console.log('| --- | --- | --- | --- |');
for (const r of results) {
    console.log(
        `| ${r.section} | ${r.pumpkins} | ${r.blockedPct}% | ${r.tightestGap} units |`,
    );
}
const worst = Math.max(...results.map(r => r.blockedPct));
console.log(
    worst === 0
        ? `\nEvery layout sampled had a continuous path through it.`
        : `\nUp to ${worst}% of layouts had no path through — those runs end in a death the player could not avoid.`,
);
