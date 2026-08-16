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
        // Imported rather than restated: this was a copy of the constant, and
        // a copy of a constant is a constant that goes stale — it sat at 44
        // while the craft was given more steering, which would have validated
        // the route against reach the sweep no longer knew about.
        const { LATERAL_SPEED } = await import('/src/config/constants.ts');
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

        /**
         * The longest stretch of track that can be flown on one fixed x.
         *
         * The column above asks whether a band of x survives a whole section,
         * and answering "no" is weaker than it sounds: an x touched once at
         * the very top of a section scores zero there and is still open for
         * the nineteen hundred units below it. What the player reports is not
         * a band, it is a duration — "I held one key and never had to dodge" —
         * and this measures that directly: for every x, the largest gap in z
         * between the blocks that cover it, including the run in from the
         * section's start and the run out to its end.
         *
         * It is the number that would have caught the open channel earlier.
         * The field measured as busy, fair and evenly weighted on both sides
         * while some x was flyable for an entire sector, because nothing that
         * was being measured was measured along the direction of travel.
         *
         * Read against the control beside it, never on its own. Some x always
         * gets lucky: with eighty blocks spread over a hundred and twenty
         * units of width, a given strip is covered seven times in two thousand
         * units, and the largest gap among a hundred and twenty such strips is
         * most of a sector by chance alone. So the same blocks, with the same
         * footprints, are thrown at the section uniformly and measured again.
         * The control is what this density can do; the gap between the two is
         * what the layout is adding, and the layout is the only part that can
         * be fixed without changing how much is on the track.
         */
        const holdLine = (obstacles, startZ, endZ) => {
            const half = cfg.FIELD_WIDTH / 2;
            let longest = 0;
            for (let x = -half; x <= half; x += 1) {
                const hits = obstacles
                    .filter(p => Math.abs(p.x - x) < p.r)
                    .map(p => p.z)
                    .sort((a, b) => b - a);
                let prev = startZ;
                for (const z of hits) {
                    if (prev - z > longest) longest = prev - z;
                    prev = z;
                }
                if (prev - endZ > longest) longest = prev - endZ;
            }
            return longest;
        };

        /** The same blocks, thrown at the same ground with no rules at all. */
        const shuffled = (obstacles, startZ, endZ) =>
            obstacles.map(p => ({
                r: p.r,
                x: (Math.random() - 0.5) * cfg.FIELD_WIDTH,
                z: endZ + Math.random() * (startZ - endZ),
            }));

        /**
         * What a stretch of track looks like from inside it, as opposed to
         * what the sweep can prove about a whole section.
         *
         * The reach set answers "is there a way through, and how many" with
         * the whole section in hand. A player has the fog — about six hundred
         * units — and reads the field as shapes: a run of blocks whose
         * footprints touch is one obstacle to them however many blocks it was
         * built from, and the ground between two such runs is the choice they
         * actually get to make. So this walks the section in windows, merges
         * overlapping footprints in x, and reports how many separate things
         * stand in a window and how wide each has grown.
         *
         * Fewer, fatter clumps and the same block count is a field that reads
         * as walls with holes; more, thinner ones is a field that reads as
         * things to go around.
         */
        const clumping = obstacles => {
            const WINDOW = 220;
            const zs = obstacles.map(p => p.z);
            const top = Math.max(...zs);
            const bottom = Math.min(...zs);
            let clumps = 0;
            let width = 0;
            let windows = 0;
            for (let z = top; z > bottom; z -= WINDOW) {
                const here = obstacles
                    .filter(p => p.z <= z && p.z > z - WINDOW)
                    .map(p => [p.x - p.r, p.x + p.r])
                    .sort((a, b) => a[0] - b[0]);
                if (!here.length) continue;
                const merged = here.reduce((acc, cur) => {
                    const prev = acc[acc.length - 1];
                    if (prev && cur[0] <= prev[1]) prev[1] = Math.max(prev[1], cur[1]);
                    else acc.push([...cur]);
                    return acc;
                }, []);
                clumps += merged.length;
                width += merged.reduce((s, [a, b]) => s + (b - a), 0) / merged.length;
                windows++;
            }
            return windows
                ? { clumps: clumps / windows, width: width / windows }
                : { clumps: 0, width: 0 };
        };

        /**
         * How often there is something on both sides of the craft at once.
         *
         * The column above counts separate things in a window without caring
         * where they stand, and a window can score four while every one of the
         * four sits to the right of the player — which is what a screenshot of
         * "still all on one side" actually shows. Two blocks per fifty units
         * of track is a thin enough sample that landing them on the same side
         * is a coin toss, and a coin toss lands the same way half the time.
         *
         * So this asks the question the cockpit asks: within a window, and
         * within the ground the player could actually reach, is there work on
         * the left and work on the right? Anything less is a field that tells
         * you which way to go instead of asking.
         */
        const REACHABLE = 55;
        const bothSides = obstacles => {
            const WINDOW = 250;
            const zs = obstacles.map(p => p.z);
            const top = Math.max(...zs);
            const bottom = Math.min(...zs);
            let both = 0;
            let lean = 0;
            let windows = 0;
            for (let z = top; z > bottom; z -= WINDOW) {
                const here = obstacles.filter(p => p.z <= z && p.z > z - WINDOW);
                if (!here.length) continue;
                const laneX = mod.laneAt(z - WINDOW / 2);
                const left = here.filter(
                    p => p.x < laneX && laneX - p.x < REACHABLE,
                ).length;
                const right = here.filter(
                    p => p.x > laneX && p.x - laneX < REACHABLE,
                ).length;
                if (!left && !right) continue;
                windows++;
                if (left && right) both++;
                // Presence is not balance: a window with six blocks right and
                // one left passes the test above and still reads as a wall on
                // one side. This is the share the busier side holds — a half
                // is even, a one is everything on one hand.
                lean += Math.max(left, right) / (left + right);
            }
            return windows
                ? { both: both / windows, lean: lean / windows }
                : { both: 0, lean: 1 };
        };

        const out = [];
        for (let section = 0; section < sections; section++) {
            let blocked = 0;
            let tightest = Infinity;
            let freeTotal = 0;
            let freeWorst = 0;
            let holdTotal = 0;
            let holdWorst = 0;
            let holdControl = 0;
            let sidedTotal = 0;
            let leanTotal = 0;
            let clumpTotal = 0;
            let clumpWidth = 0;
            let routeSteps = 0;
            let routeTotal = 0;
            let forkSteps = 0;

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
                    // How many separate ways through there are right here, as
                    // opposed to whether there is one. The reach set is already
                    // the answer: each interval is a corridor the craft could
                    // be in and still survive what is ahead, and two intervals
                    // mean a block between them that has to be gone round on a
                    // side the player picks. A field that is fair, dense and
                    // has one interval everywhere is a queue, not a route —
                    // which is a thing the other columns cannot see.
                    const flyable = reach.filter(([a, b]) => b - a >= 6).length;
                    routeSteps++;
                    routeTotal += flyable;
                    if (flyable >= 2) forkSteps++;
                    if (!reach.length) deadAt = z;
                }

                if (deadAt !== null) blocked++;

                const free = freeLine(obstacles);
                freeTotal += free;
                if (free > freeWorst) freeWorst = free;

                const hold = holdLine(obstacles, startZ, endZ);
                holdTotal += hold;
                if (hold > holdWorst) holdWorst = hold;
                holdControl += holdLine(
                    shuffled(obstacles, startZ, endZ),
                    startZ,
                    endZ,
                );

                const sided = bothSides(obstacles);
                sidedTotal += sided.both;
                leanTotal += sided.lean;
                const shape = clumping(obstacles);
                clumpTotal += shape.clumps;
                clumpWidth += shape.width;
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
                hold: Math.round(holdTotal / trials),
                holdWorst: Math.round(holdWorst),
                holdSeconds: (holdTotal / trials / pace).toFixed(1),
                holdControl: Math.round(holdControl / trials),
                bothSidesPct: Math.round((sidedTotal / trials) * 100),
                leanPct: Math.round((leanTotal / trials) * 100),
                clumps: (clumpTotal / trials).toFixed(1),
                clumpWidth: Math.round(clumpWidth / trials),
                routes: (routeTotal / Math.max(1, routeSteps)).toFixed(1),
                forkPct: Math.round((forkSteps / Math.max(1, routeSteps)) * 100),
            });
        }
        return out;
    },
    { sections: SECTIONS, trials: TRIALS },
);

await browser.close();

console.log(`\n# Obstacle-layout fairness (${TRIALS} generated layouts per section)\n`);
console.log(
    '| Section | Obstacles | Blocks/second | Layouts with no way through | Tightest gap | Straight line through (avg / worst) | Flown on one fixed x (avg / worst / same blocks at random) | Things in view / how wide | Something both sides | Busier side holds | Ways through | Where there is a choice |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
    console.log(
        `| ${r.section} | ${r.obstacles} | ${r.perSecond} | ${r.blockedPct}% | ${r.tightestGap} units | ` +
            `${r.freeLine} / ${r.freeLineWorst} units | ${r.hold} / ${r.holdWorst} / ${r.holdControl} units (${r.holdSeconds}s) | ${r.clumps} × ${r.clumpWidth} units | ${r.bothSidesPct}% | ${r.leanPct}% | ${r.routes} | ${r.forkPct}% |`,
    );
}
const sides = results.filter(r => r.obstacles).map(r => r.bothSidesPct);
console.log(
    `\nSomething to fly round on both sides at once on ${Math.min(...sides)}–${Math.max(...sides)}% ` +
        `of the route, and the busier side holds ${Math.min(...results.map(r => r.leanPct))}–${Math.max(...results.map(r => r.leanPct))}% of what is in view. ` +
        `Fifty per cent is an even split; the higher it runs the more the field is telling the player which way to go.`,
);
const forks = results.filter(r => r.obstacles).map(r => r.forkPct);
console.log(
    `\nSomewhere between two and ${Math.max(...results.map(r => Number(r.routes)))} ways through at once; ` +
        `a choice of side on ${Math.min(...forks)}–${Math.max(...forks)}% of the route. ` +
        `One way through everywhere is fair and still a queue.`,
);
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
const held = Math.round(
    results.reduce((s, r) => s + r.hold, 0) / results.length,
);
const control = Math.round(
    results.reduce((s, r) => s + r.holdControl, 0) / results.length,
);
console.log(
    `\nLongest stretch flyable without touching the controls: ${held} units on ` +
        `average, against ${control} for the same blocks thrown at the same ground ` +
        `at random. The control is what this density can do; anything above it is ` +
        `the layout handing out an open channel.`,
);
const idle = Math.max(...results.map(r => r.freeLineWorst));
console.log(
    idle === 0
        ? `No section could be flown on a fixed x: every layout demanded steering.`
        : `Widest straight line anywhere: ${idle} units — that much of some section flies itself.`,
);
