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
        const mod = await import('/src/utils/generateObstacles.ts');
        const cfg = await import('/src/config/obstacles.ts');
        const levels = await import('/src/config/levels.ts');

        // Each obstacle carries its own collision footprint, so the sweep
        // uses that rather than one figure for all of them.
        //
        // Sideways reach per unit travelled is LATERAL_SPEED against the
        // forward speed of the level that section is played at — and that
        // is the whole point: the faster the level, the less the craft can
        // move sideways per metre of track. Hard-coding the opening speed
        // here (as this did) quietly validated the late game against reach
        // it does not have.
        const LATERAL_SPEED = 44;
        const reachAt = section => {
            const z = -section * cfg.SECTION_LENGTH;
            const speed = levels.paletteFor(levels.levelAt(z)).speed;
            return LATERAL_SPEED / (speed * 60);
        };
        const STEP = 10; // forward sampling resolution

        /**
         * Widest band of x that survives the whole section untouched.
         *
         * "Is there a way through" and "does the player have to do anything"
         * are different questions, and only the first one was being asked. A
         * layout can be perfectly fair and still be a corridor you hold one
         * key through — which is what a lane that jitters instead of sweeping
         * produces. This measures the second: any non-zero result is a
         * straight line down which the section flies itself.
         */
        const freeLine = obstacles => {
            const half = cfg.FIELD_WIDTH / 2;
            const STEP_X = 1;
            let widest = 0;
            let run = 0;
            for (let x = -half; x <= half; x += STEP_X) {
                const hit = obstacles.some(p => Math.abs(p.x - x) < p.r);
                run = hit ? 0 : run + STEP_X;
                if (run > widest) widest = run;
            }
            return widest;
        };

        const out = [];
        for (let section = 0; section < sections; section++) {
            let blocked = 0;
            let tightest = Infinity;
            let freeTotal = 0;
            let freeWorst = 0;

            for (let t = 0; t < trials; t++) {
                // A fresh route per trial, not a fresh throw of the dice on
                // one route. The layout's shape — where the lane crosses,
                // where the field thickens, where the events sit — is now the
                // run's seed rather than a constant, so sampling one seed many
                // times would test one route many times and say nothing about
                // the one the player is actually handed.
                mod.reseedRoute(section * 7919 + t);
                const obstacles = mod
                    .generateSectionObstacles(section)
                    .map(o => ({ x: o.position.x, z: o.position.z, r: o.radius }));
                const zs = obstacles.map(p => p.z);
                const startZ = Math.max(...zs);
                const endZ = Math.min(...zs);

                // Reachable set of x positions, swept forward. Start anywhere,
                // widen by what the player could reach over each step, then
                // remove anything within HIT_RADIUS of an obstacle.
                let reach = [[-cfg.FIELD_WIDTH / 2, cfg.FIELD_WIDTH / 2]];
                let deadAt = null;

                for (let z = startZ; z > endZ && !deadAt; z -= STEP) {
                    const grow = STEP * reachAt(section);
                    reach = reach.map(([a, b]) => [a - grow, b + grow]);

                    const near = obstacles.filter(
                        p => p.z <= z && p.z > z - STEP,
                    );
                    for (const p of near) {
                        const next = [];
                        for (const [a, b] of reach) {
                            const lo = p.x - p.r;
                            const hi = p.x + p.r;
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

                const free = freeLine(obstacles);
                freeTotal += free;
                if (free > freeWorst) freeWorst = free;
            }

            const sample = mod.generateSectionObstacles(section);
            // What the layout costs the player, as opposed to what it costs
            // the map. A section is flown at 900 units a second early and 2040
            // late, so the same count of blocks arrives at more than twice the
            // rate by the end of the route — which is the crowding a player
            // reports and which none of the columns above can show, since the
            // sweep gets to see a whole section at once and a player sees the
            // six hundred units the fog leaves them.
            const midZ = -(section + 0.5) * cfg.SECTION_LENGTH;
            const pace = levels.paletteFor(levels.levelAt(midZ)).speed * 60;

            out.push({
                section,
                obstacles: sample.length,
                perSecond: Math.round(
                    (sample.length / cfg.SECTION_LENGTH) * pace,
                ),
                blockedPct: Math.round((blocked / trials) * 100),
                tightestGap: Math.round(tightest),
                freeLine: Math.round(freeTotal / trials),
                freeLineWorst: freeWorst,
            });
        }
        return out;
    },
    { sections: SECTIONS, trials: TRIALS },
);

await browser.close();

console.log(`\n# Obstacle-layout fairness (${TRIALS} generated layouts per section)\n`);
console.log(
    '| Section | Obstacles | Blocks/second | Layouts with no way through | Tightest gap | Straight line through (avg / worst) |',
);
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of results) {
    console.log(
        `| ${r.section} | ${r.obstacles} | ${r.perSecond} | ${r.blockedPct}% | ${r.tightestGap} units | ` +
            `${r.freeLine} / ${r.freeLineWorst} units |`,
    );
}
const rates = results.filter(r => r.obstacles).map(r => r.perSecond);
console.log(
    `\nBlocks met per second: ${Math.min(...rates)}–${Math.max(...rates)}. ` +
        `Budgeted per second rather than per unit of track, so this is the ` +
        `route's own swing and not the speedometer's.`,
);
const worst = Math.max(...results.map(r => r.blockedPct));
console.log(
    worst === 0
        ? `\nEvery layout sampled had a continuous path through it.`
        : `\nUp to ${worst}% of layouts had no path through — those runs end in a death the player could not avoid.`,
);
const idle = Math.max(...results.map(r => r.freeLineWorst));
console.log(
    idle === 0
        ? `No section could be flown on a fixed x: every layout demanded steering.`
        : `Widest straight line anywhere: ${idle} units — that much of some section flies itself.`,
);
