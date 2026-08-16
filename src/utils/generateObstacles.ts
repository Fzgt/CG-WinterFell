import * as THREE from 'three';
import { randomInRange2 } from './utils';
import { LATERAL_SPEED, OBSTACLES_END_Z } from '../config/constants';
import { levelAt, paletteFor } from '../config/levels';
import {
    OBSTACLE_BASE_RADIUS,
    FIELD_WIDTH,
    SECTION_LENGTH,
    SLICE_DEPTH,
    LANE_HALF,
    BLOCKS_PER_SECOND,
    DIFFICULTY_RAMP_SECTIONS,
    BLOCK_HEIGHT,
    BLOCK_WIDTH,
    SILHOUETTE_BUDGET,
} from '../config/obstacles';

export interface Obstacle {
    position: THREE.Vector3;
    /** Non-uniform, so no two blocks are the same. */
    scale: THREE.Vector3;
    rotationY: number;
    /** Footprint used for collision, derived from this one's own width. */
    radius: number;
}

/**
 * The field is terrain, not a playlist of layouts.
 *
 * It used to be four named formations — scatter, gates, slalom, pillars — one
 * per 2000-unit section, and that shape is what a player actually feels: the
 * route arrives at a boundary, swaps wholesale into a different rule, and runs
 * that rule for half a minute. Every formation is a surprise exactly once. The
 * gate wall in particular could only be built by spanning the whole track, and
 * a thing that spans the whole track is a thing you stare at rather than see
 * past.
 *
 * So there are no formations. Three continuous functions of world z decide
 * what stands where, sampled every SLICE_DEPTH units:
 *
 *  - the lane:     the guaranteed way through, sweeping as fast as the craft
 *                  can follow at the speed that stretch is flown at
 *  - pressure:     how much of the field is occupied here
 *  - the low/tall  whether this stretch is made of broad low blocks you look
 *    balance:      over, or narrow tall ones you look past
 *
 * All three are smooth noise with different periods, so they drift in and out
 * of phase and no stretch of track resembles the one before it — and none of
 * them knows where a section boundary is, so the seams disappear. Clusters
 * (knots and combs, below) ride on top, which is where the field gets the
 * shapes a formation used to hand it, at a scale of tens of units rather than
 * thousands.
 *
 * The contract is unchanged and bench/fairness.mjs still enforces it: there is
 * always a continuous path through, and the lane never asks for more lateral
 * speed than the craft has.
 */

/* ----------------------------------------------------------------- noise -- */

/** Deterministic 0..1 from two integers. */
const hash2 = (a: number, b: number) => {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ Math.imul(b + 0x165667b1, 0x27d4eb2f), 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
};

/**
 * Smooth 0..1 value noise along the track.
 *
 * Smooth rather than per-slice random on purpose: a field whose density is
 * redrawn every fifty units is uniformly busy at any scale you can perceive,
 * which is the same as being flat. Interpolating between hashed knots gives
 * the route stretches — a long thinning out, a build to a knot of pressure —
 * that a player can feel arriving.
 */
const noiseAt = (z: number, period: number, seed: number) => {
    const p = Math.abs(z) / period;
    const i = Math.floor(p);
    const f = p - i;
    const s = f * f * (3 - 2 * f); // smoothstep
    return THREE.MathUtils.lerp(hash2(i, seed), hash2(i + 1, seed), s);
};

/** Two octaves: a long swell with a shorter one riding on it. */
const layered = (z: number, period: number, seed: number) =>
    0.68 * noiseAt(z, period, seed) + 0.32 * noiseAt(z, period * 0.37, seed + 1);

const HALF_WIDTH = FIELD_WIDTH / 2;

/* ------------------------------------------------------------- the route -- */

/**
 * The opening's discount on the full block rate.
 *
 * Shallower than it was (0.55) because it no longer has to be the only thing
 * keeping the first minute readable — the rate is per second now, so speed
 * stops compounding into it, and this is left doing the one job it is good at:
 * giving a first-time player a sparser sector to learn the controls in.
 */
const rampFor = (section: number) =>
    0.7 + 0.3 * Math.min(section / DIFFICULTY_RAMP_SECTIONS, 1);

/**
 * Forward world units covered in a second at the speed this z is flown at.
 *
 * The conversion between the map and the clock, and the reason the block rate
 * is expressed per second: this runs from 900 at the start line to 2040 by the
 * top speed, so a fixed count per unit of track is a count that more than
 * doubles in the only unit the player has.
 */
const paceAt = (z: number) => paletteFor(levelAt(z)).speed * 60;

/**
 * Lateral units the craft can cover per unit of forward travel, at the speed
 * the level owning this z runs at.
 *
 * This is the number the lane has to respect. It shrinks as the run speeds up
 * — at the opening 15 the craft moves 0.049 sideways per unit forward, by the
 * sixth level only 0.024 — so a lane that wanders 26 units per hundred, fine
 * at the speeds this game shipped with, becomes a lane the player physically
 * cannot follow. bench/fairness.mjs measures the same ratio for this reason.
 */
const reachAt = (z: number) => LATERAL_SPEED / paceAt(z);

/**
 * Fraction of the theoretical reach the lane may demand. The rest is the
 * player's: reaction time, the craft's easing onto its lane target, and the
 * fact that nobody threads a gap by arriving exactly at its edge.
 */
const FOLLOW = 0.55;

const LANE_LIMIT = HALF_WIDTH - LANE_HALF.max;

/**
 * How much ground the lane covers over a window, against the most it could
 * cover at this speed: 1 where it is sweeping across the field, 0 where it has
 * run into the edge and turned back.
 *
 * Measured over a window rather than between two samples, because the step
 * length never drops — a lane oscillating either side of a turning point moves
 * at full tilt and goes nowhere, and it is going nowhere that leaves an x the
 * craft can sit in.
 */
const laneSweepOver = (z: number, window: number) => {
    const moved = Math.abs(laneAt(z - window) - laneAt(z + window));
    const most = 2 * window * reachAt(z) * FOLLOW * 0.8;
    return THREE.MathUtils.clamp(moved / most, 0, 1);
};

/**
 * The widest band of x a sector is allowed to leave untouched, and the
 * footprint of the narrowest block that could stand at the corridor's edge.
 */
const FREE_TARGET = 10;
const NARROW_RADIUS = OBSTACLE_BASE_RADIUS * BLOCK_WIDTH.min;

/**
 * The full width of x the lane occupies over a sector's worth of track around
 * this z — its extremes, not the distance between its endpoints.
 *
 * The endpoints were what this measured, and they are not the same question. A
 * lane that runs out twenty units and comes back has endpoints on top of each
 * other and an extent of twenty, and it is the extent that decides how much
 * ground the corridor covers: the band of x that sits inside the lane from one
 * end of the sector to the other is two clearances less the extent. Reading it
 * off the endpoints let the corridor stay wide through exactly the stretches
 * where the lane doubled back, which is where a wide corridor is a straight
 * line — the sweep found twenty-unit free bands sitting in the middle of the
 * lane's own band, somewhere no block is allowed to stand and so somewhere no
 * amount of blocks could have closed.
 *
 * Quantised to the slice and memoised: it is a pure function of z, it is asked
 * for once per candidate position, and it walks forty samples to answer.
 */
const spreads = new Map<number, number>();

const laneSpreadAt = (z: number) => {
    const key = Math.round(Math.abs(z) / SLICE_DEPTH);
    const cached = spreads.get(key);
    if (cached !== undefined) return cached;

    const centre = -key * SLICE_DEPTH;
    const span = SECTION_LENGTH / 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = -span; d <= span; d += SLICE_DEPTH) {
        const x = laneAt(centre + d);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
    }
    const spread = hi - lo;
    spreads.set(key, spread);
    return spread;
};

/**
 * How wide the corridor is here.
 *
 * Partly noise, so the route has moments a player can feel arriving; capped by
 * arithmetic, which is the part that decides whether the sector is a sector or
 * a straight line.
 *
 * Nothing may stand within `laneHalf` of the lane, so the band of x that no
 * block in a sector ever touches is about two clearances wide less however far
 * the lane ranges across that sector — and the range is not negotiable, it is
 * the craft's lateral speed against the route's. By the sixth level the lane
 * can be asked for nineteen units across a whole sector; against a corridor 36
 * wide that leaves seventeen units of x never once touched, which is a sector
 * flown with one key held down. So the corridor is the thing that gives: it is
 * capped at whatever leaves FREE_TARGET, which opens it where the lane is
 * crossing the field and closes it where the lane has run into the edge of the
 * field and turned back — steepest exactly where the route would otherwise
 * have nothing to ask.
 */
const laneHalfAt = (z: number) => {
    const cap = (FREE_TARGET + laneSpreadAt(z)) / 2 - NARROW_RADIUS;
    const wanted = THREE.MathUtils.lerp(
        LANE_HALF.min,
        LANE_HALF.max,
        layered(z, 430, 41),
    );
    return THREE.MathUtils.clamp(
        Math.min(wanted, cap),
        LANE_HALF.min,
        LANE_HALF.max,
    );
};

/**
 * The lane, as one continuous function of world z.
 *
 * Two things it has to be at once, which is why it is walked rather than
 * written down. It has to sweep — a lane that steps a signed random amount
 * each time is a random walk, and a random walk comes back: the old one spent
 * every unit of the difficulty budget on steps that cancelled, and left one x
 * you could hold for a whole section. And it has to be the same function on
 * both sides of a section boundary, or the route hands the player a lane that
 * teleports every 2000 units — which the old generator papered over by seeding
 * each section from wherever the craft happened to be.
 *
 * So: a walk from the start line at the largest step this z's speed allows,
 * holding a direction long enough to actually cross ground, memoised. The
 * samples only ever extend, so laneAt(z) is a pure function of z however the
 * sections above it are built or rebuilt.
 */
const laneSamples: number[] = [0];
let laneDir = 1;
let laneHold = 0;

const extendLaneTo = (index: number) => {
    while (laneSamples.length <= index) {
        const i = laneSamples.length;
        const z = -i * SLICE_DEPTH;
        const maxStep = SLICE_DEPTH * reachAt(z) * FOLLOW;
        // How long a direction is held is set by the ground it has to cover,
        // not by a count of slices — so the hold stays right whatever the
        // speed. A hold shorter than the corridor's own width leaves an x that
        // sits inside the lane from one end of a sector to the other, and the
        // sector flies itself: the random walk's failure wearing a longer
        // stride. Every run therefore commits to at least one full corridor
        // width, and often two.
        const crossing =
            ((1.2 + 0.9 * hash2(i, 13)) * LANE_HALF.max * 2) / (0.8 * maxStep);
        if (laneHold <= 0) {
            laneHold = Math.ceil((0.75 + 0.5 * hash2(i, 7)) * crossing);
            laneDir = hash2(i, 8) < 0.5 ? -1 : 1;
        }
        // Steps vary, so the lane reads as drifting rather than as a ramp.
        const step = (0.6 + 0.4 * hash2(i, 9)) * maxStep;
        const previous = laneSamples[i - 1];
        // Turn at the boundary, and commit to the turn with a fresh hold —
        // flipping without one lets the next roll send it straight back out,
        // and the lane parks against the edge, which is a straight line again.
        if (previous + laneDir * step < -LANE_LIMIT ||
            previous + laneDir * step > LANE_LIMIT) {
            laneDir = -laneDir;
            laneHold = Math.round((0.45 + 0.75 * hash2(i, 11)) * crossing);
        }
        laneHold--;
        laneSamples.push(
            THREE.MathUtils.clamp(
                previous + laneDir * step,
                -LANE_LIMIT,
                LANE_LIMIT,
            ),
        );
    }
};

export const laneAt = (z: number) => {
    const p = Math.abs(z) / SLICE_DEPTH;
    const i = Math.floor(p);
    extendLaneTo(i + 1);
    return THREE.MathUtils.lerp(laneSamples[i], laneSamples[i + 1], p - i);
};

/* ---------------------------------------------------------------- blocks -- */

interface Shape {
    width: number;
    height: number;
    depth: number;
    rotationY: number;
}

/**
 * One block, from one number.
 *
 * `tall` in 0..1 runs from a broad low slab to a narrow spire, and the width
 * is not free: it is whatever the silhouette budget leaves once the height is
 * paid for. That is the whole shape system. There is no combination of rolls
 * that yields something both tall and wide, which is the only property of a
 * block that can take the scenery away.
 */
const blockShape = (tall: number): Shape => {
    const height = THREE.MathUtils.lerp(
        BLOCK_HEIGHT.min,
        BLOCK_HEIGHT.max,
        tall,
    );
    const width = THREE.MathUtils.clamp(
        (SILHOUETTE_BUDGET / height) * randomInRange2(0.72, 1),
        BLOCK_WIDTH.min,
        BLOCK_WIDTH.max,
    );
    return {
        width,
        height,
        // Squarish in plan: a wide slab drawn thin in z reads as a hoarding
        // from behind and vanishes the moment it is passed.
        depth: THREE.MathUtils.clamp(width * randomInRange2(0.7, 1.3), 0.5, 1.7),
        rotationY: randomInRange2(-0.5, 0.5),
    };
};

/**
 * Where this stretch sits between broad-and-low and narrow-and-tall, and how
 * many blocks that buys.
 *
 * The two are tied on purpose. A low block costs the player nothing to look
 * past, so a stretch built from low blocks can afford half again as many of
 * them — and has to, because the same count of slabs as spires is a stretch
 * with nothing in it. That was the complaint: the parts made of low blocks had
 * no difficulty in them. Difficulty in a low stretch is bought with count;
 * in a tall stretch it is bought with placement, and the count comes down.
 */
const lownessAt = (z: number) => 0.15 + 0.75 * layered(z, 880, 17);

const tallnessRoll = (lowness: number) =>
    Math.pow(Math.random(), 0.55 + 2.6 * lowness);

const place = (shape: Shape, x: number, z: number): Obstacle => ({
    position: new THREE.Vector3(x, 0, z),
    scale: new THREE.Vector3(shape.width, shape.height, shape.depth),
    rotationY: shape.rotationY,
    radius: OBSTACLE_BASE_RADIUS * shape.width,
});

/**
 * How far this block's centre has to sit from the lane centre.
 *
 * Its own footprint plus the lane, because a 2.5-wide slab carries an 11.5
 * radius: one placed just outside a nominal 15-unit lane reaches most of the
 * way back across it. The lane has to be as wide to fly as it is to look at.
 */
const clearFor = (shape: Shape, z: number) =>
    laneHalfAt(z) + OBSTACLE_BASE_RADIUS * shape.width;

/* -------------------------------------------------------------- coverage -- */

/** Width of one tally bin, well under an obstacle's own footprint. */
const BIN_WIDTH = 4;
const BINS = Math.ceil(FIELD_WIDTH / BIN_WIDTH);

const binAt = (x: number) =>
    THREE.MathUtils.clamp(
        Math.floor((x + HALF_WIDTH) / BIN_WIDTH),
        0,
        BINS - 1,
    );

/**
 * How much of the section each part of the track has seen so far.
 *
 * Uniform random placement is what makes a field read as scattered, and also
 * what leaves an x nobody ever stood in: over forty slices some strip comes up
 * empty every time, and a strip empty for a whole section is a straight line
 * down which the section flies itself — the sweep measured runs of thirty-odd
 * units that way, on a field that looked perfectly busy.
 *
 * Closing those by adding blocks is how a track ends up unplayable. Keep the
 * count and choose better instead: draw a few legal spots and take the one in
 * the emptiest strip. Three candidates, not the best of everything — picking
 * the global optimum every time spaces the field into a lattice, which is the
 * wallpaper problem wearing a different hat.
 */
const coverage = () => {
    const bins = new Int32Array(BINS);
    return {
        seen: (x: number) => bins[binAt(x)],
        mark: (x: number, radius: number) => {
            const to = binAt(x + radius);
            for (let i = binAt(x - radius); i <= to; i++) bins[i]++;
        },
    };
};

/** A spot for `shape` clear of the lane, biased toward the emptiest x. */
const spread = (
    tally: ReturnType<typeof coverage>,
    shape: Shape,
    z: number,
    laneX: number,
): number | null => {
    const clear = clearFor(shape, z);
    let best: number | null = null;

    for (let candidate = 0; candidate < 3; candidate++) {
        let x = 0;
        let legal = false;
        for (let attempt = 0; attempt < 8 && !legal; attempt++) {
            x = randomInRange2(-HALF_WIDTH, HALF_WIDTH);
            legal = Math.abs(x - laneX) > clear;
        }
        if (legal && (best === null || tally.seen(x) < tally.seen(best))) {
            best = x;
        }
    }
    if (best !== null) tally.mark(best, OBSTACLE_BASE_RADIUS * shape.width);
    return best;
};

/* -------------------------------------------------------------- clusters -- */

/**
 * The shapes the formations used to provide, at a scale you meet rather than
 * live in.
 *
 * Pure noise gives an even field: interesting to fly, but every fifty units
 * looks like every other fifty units. A run wants events. Two of them, both
 * placed by the same rules as everything else — outside the lane, tallied for
 * coverage — and both a few tens of units long, so one is something you fly
 * through rather than a rule you live under for half a minute:
 *
 *  - a knot: a tight cluster of one kind of block, the thing you swing wide of
 *  - a comb: a short run of narrow spires at even spacing, the thing you pick
 *            a slot in
 *
 * A comb is the gate wall the old generator built, except it stands to one
 * side, it is made of blocks you see through, and it is over in eighty units.
 */
/**
 * Blocks that hug the edge of the lane, where the route is railed.
 *
 * Scattering at random x leaves the corridor unmarked: nothing stands at its
 * edge, so the band the craft can sit in untouched is the lane plus whatever
 * empty ground happens to adjoin it — which is how a sector with eighty blocks
 * in it still measured a thirty-unit line you could hold one key down through.
 * A shoulder puts a block exactly at the clearance, so the corridor is as
 * narrow to fly as it is on paper, and the player is being asked to stay
 * inside something rather than to avoid things in general.
 *
 * Railed in stretches rather than everywhere, and often on one side only: a
 * corridor walled on both sides for a whole sector is the canyon that used to
 * be a formation, and it plays the same way for as long as it lasts.
 */
const shoulders = (
    tally: ReturnType<typeof coverage>,
    z: number,
    laneX: number,
    lowness: number,
    rail: number,
    out: Obstacle[],
) => {
    const sides =
        rail > 0.72
            ? [-1, 1]
            : [hash2(Math.round(Math.abs(z)), 31) < 0.5 ? -1 : 1];
    for (const side of sides) {
        const shape = blockShape(tallnessRoll(lowness));
        const x = laneX + side * (clearFor(shape, z) + Math.random() * 4);
        if (Math.abs(x) > HALF_WIDTH) continue;
        tally.mark(x, OBSTACLE_BASE_RADIUS * shape.width);
        out.push(place(shape, x, z + randomInRange2(-SLICE_DEPTH / 2, SLICE_DEPTH / 2)));
    }
};

const knot = (
    tally: ReturnType<typeof coverage>,
    z: number,
    laneX: number,
    lowness: number,
    out: Obstacle[],
) => {
    const tall = tallnessRoll(lowness);
    const centre = spread(tally, blockShape(tall), z, laneX);
    if (centre === null) return;

    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        // Same family of block, so the knot reads as one object.
        const shape = blockShape(THREE.MathUtils.clamp(tall + randomInRange2(-0.12, 0.12), 0, 1));
        const x = centre + randomInRange2(-13, 13);
        if (Math.abs(x) > HALF_WIDTH) continue;
        if (Math.abs(x - laneX) < clearFor(shape, z)) continue;
        tally.mark(x, OBSTACLE_BASE_RADIUS * shape.width);
        out.push(place(shape, x, z + randomInRange2(-26, 26)));
    }
};

const comb = (
    tally: ReturnType<typeof coverage>,
    z: number,
    laneX: number,
    out: Obstacle[],
) => {
    // Spires only: a comb spans ground, and only the narrow silhouette may.
    const spacing = randomInRange2(13, 19);
    const side = laneX > 0 ? -1 : 1;
    const from = laneX + side * randomInRange2(24, 34);
    const teeth = 3 + Math.floor(Math.random() * 4);

    for (let i = 0; i < teeth; i++) {
        const shape = blockShape(randomInRange2(0.72, 1));
        const x = from + side * i * spacing;
        if (Math.abs(x) > HALF_WIDTH) break;
        if (Math.abs(x - laneX) < clearFor(shape, z)) continue;
        tally.mark(x, OBSTACLE_BASE_RADIUS * shape.width);
        out.push(place(shape, x, z + randomInRange2(-14, 14)));
    }
};

/* ------------------------------------------------------------------ seal -- */

/**
 * Close any x that survived the whole section untouched.
 *
 * Even with placement biased toward the emptiest strip, a column occasionally
 * comes up empty over forty slices, and one empty column is a straight line
 * the section flies itself down. The fix is not more blocks everywhere — it is
 * one block in the column that needs it, and a low broad one, because a seal
 * exists to be in the way and not to be looked at.
 *
 * A seal that would stand in the lane is skipped rather than forced: a
 * straight line through a sector is a dull sector, a sealed lane is an
 * unwinnable one, and those are not the same mistake.
 */
/** A free run wider than this is one the craft can sit in unattended. */
const MAX_FREE = 6;

const seal = (out: Obstacle[], lane: { z: number; x: number }[]) => {
    // Measured the way the sweep measures it — a strip of x against the real
    // footprints — rather than through the placement tally, which marks a bin
    // an obstacle merely clips and so calls a column busy that is not.
    const covered = new Uint8Array(FIELD_WIDTH + 1);
    const paint = (o: Obstacle) => {
        const from = Math.max(0, Math.ceil(o.position.x + HALF_WIDTH - o.radius));
        const to = Math.min(FIELD_WIDTH, Math.floor(o.position.x + HALF_WIDTH + o.radius));
        for (let i = from; i <= to; i++) covered[i] = 1;
    };
    out.forEach(paint);

    // Two passes: the first block dropped into a wide run rarely closes all of
    // it, and the leftovers on either side are still free lines.
    for (let pass = 0; pass < 2; pass++) {
        const runs: [number, number][] = [];
        let from = -1;
        for (let i = 0; i <= FIELD_WIDTH + 1; i++) {
            if (i <= FIELD_WIDTH && !covered[i]) {
                if (from < 0) from = i;
            } else if (from >= 0) {
                if (i - from > MAX_FREE) runs.push([from, i - 1]);
                from = -1;
            }
        }
        if (!runs.length) return;

        let added = 0;
        for (const [a, b] of runs) {
            const x = -HALF_WIDTH + (a + b) / 2;

            // Broad first, because one broad block closes more of a run than
            // one narrow one — then narrower, because the runs that survive
            // everything else are the ones close to the lane, where a block's
            // own footprint is what puts it out of reach. The band that keeps
            // coming up free is the ground the corridor is sweeping into: too
            // near the lane for a slab, and a spire slips in exactly there.
            let shape = blockShape(randomInRange2(0, 0.25));
            let spots: typeof lane = [];
            for (const tall of [0.15, 0.6, 0.95]) {
                shape = blockShape(tall + randomInRange2(-0.1, 0.05));
                // Anywhere the lane is far enough away, and then one of those
                // at random — always taking the furthest z would stack every
                // seal in a sector where the lane is at its extreme, which is
                // a wall by another name.
                spots = lane.filter(
                    p => Math.abs(x - p.x) >= clearFor(shape, p.z),
                );
                if (spots.length) break;
            }
            // A band with no spot left is one the lane sweeps over: every
            // block on the route stands its own footprint clear of the
            // corridor, and this x is inside it. Letting a spire stand on the
            // clearance line to close one was tried and measured no better —
            // a 4.6-wide block in a 19-wide band leaves two more bands either
            // side of it — so the case is left alone rather than paid for with
            // a rule that overhangs the corridor. It is not a placement
            // failure to fix here; it is the lateral budget, and it is noted
            // in the sweep's own output.
            if (!spots.length) continue;

            const spot = spots[Math.floor(Math.random() * spots.length)];
            const block = place(
                shape,
                x,
                spot.z + randomInRange2(-SLICE_DEPTH / 2, SLICE_DEPTH / 2),
            );
            out.push(block);
            paint(block);
            added++;
        }
        if (!added) return;
    }
};

/* ---------------------------------------------------------------- budget -- */

/**
 * How a slice's blocks are divided between the three things that place them,
 * and what each costs when it fires.
 *
 * A shoulder is the most valuable block on the route and a scattered one the
 * least, so the split is not even — but it is not winner-takes-all either. Cut
 * the block rate without splitting it and the shoulders eat the whole budget
 * on their own by the late sectors, leaving a corridor railed on both sides
 * with an empty field either side of that, which reads as a level that failed
 * to load rather than a hard one.
 *
 * Shares are targets, not caps. Neither a shoulder nor a comb can be handed a
 * count — one has to sit at the lane's edge, the other has to span ground — so
 * the share buys them a chance of firing instead, and the difference between
 * what a slice was allowed and what it actually spent is carried to the next
 * one either way.
 */
const SHOULDER = { share: 0.5, cost: 1.3, cap: 0.95 };
const EVENT = { share: 0.2, cost: 4.5, cap: 0.3 };

const shareOf = ({ share, cost, cap }: typeof SHOULDER, budget: number) =>
    Math.min(cap, (share * budget) / cost);

/* ----------------------------------------------------------------- entry -- */

const sectionBounds = (section: number): [number, number] =>
    section === 0
        ? [-250, -SECTION_LENGTH]
        : [-section * SECTION_LENGTH, -(section + 1) * SECTION_LENGTH];

export const generateSectionObstacles = (section: number): Obstacle[] => {
    const [startZ, endZ] = sectionBounds(section);
    if (startZ <= OBSTACLES_END_Z) return [];

    const ramp = rampFor(section);
    const out: Obstacle[] = [];
    const tally = coverage();
    const lane: { z: number; x: number }[] = [];
    /** Blocks spent above (or, negative, below) what the slices allowed. */
    let debt = 0;

    const depth = Math.abs(endZ - startZ);
    const slices = Math.max(1, Math.round(depth / SLICE_DEPTH));

    for (let s = 0; s < slices; s++) {
        const sliceStartZ = startZ - (depth * s) / slices;
        const sliceEndZ = startZ - (depth * (s + 1)) / slices;
        const z = (sliceStartZ + sliceEndZ) / 2;

        const laneX = laneAt(z);
        lane.push({ z, x: laneX });
        const lowness = lownessAt(z);
        const pressure = layered(z, 620, 3);

        // Low stretches carry more blocks than tall ones: see lownessAt.
        const rate =
            THREE.MathUtils.lerp(
                BLOCKS_PER_SECOND.min,
                BLOCKS_PER_SECOND.max,
                pressure,
            ) *
            (0.8 + 0.5 * lowness) *
            ramp;
        // What that rate buys in this slice: the blocks a player meets in the
        // time this fifty units takes to arrive.
        const budget = (rate * SLICE_DEPTH) / paceAt(z);

        const before = out.length;

        // Railed in stretches, and always where the lane has stopped moving:
        // that is the one place a corridor left unmarked becomes a place to
        // park, and it is also the cheapest difficulty on the route.
        const rail = layered(z, 340, 29) + 0.4 * (1 - laneSweepOver(z, 400));
        if (rail > 0.42 && Math.random() < shareOf(SHOULDER, budget)) {
            shoulders(tally, z, laneX, lowness, rail, out);
        }

        // Events, rare enough to stay events. Hashed off the slice's own z, so
        // a given stretch of track always has its knot in the same place even
        // though the blocks around it are redrawn every run.
        const event = hash2(Math.round(Math.abs(z) / SLICE_DEPTH), 23);
        const events = shareOf(EVENT, budget);
        if (event < events * 0.625) knot(tally, z, laneX, lowness, out);
        else if (event < events) comb(tally, z, laneX, out);

        // A knot is five blocks in a slice that could afford one and a half,
        // and paying for it out of this slice alone would leave the overspend
        // invisible. It is carried instead, and the scatter runs quiet until
        // it is paid off — which is what makes an event an event: the stretch
        // after one is emptier than the route around it. The debt runs
        // negative too, so a stretch where nothing fired hands its unspent
        // blocks to the scatter rather than losing them, and a sector lands on
        // its rate however the dice went.
        const allowance = budget - (out.length - before) - debt;
        const count =
            allowance <= 0
                ? 0
                : Math.floor(allowance) +
                  (Math.random() < allowance % 1 ? 1 : 0);

        for (let i = 0; i < count; i++) {
            const shape = blockShape(tallnessRoll(lowness));
            const x = spread(tally, shape, z, laneX);
            if (x === null) continue;
            out.push(place(shape, x, randomInRange2(sliceStartZ, sliceEndZ)));
        }

        debt = THREE.MathUtils.clamp(
            debt + (out.length - before) - budget,
            -2 * budget,
            3 * budget,
        );
    }

    seal(out, lane);

    // The finish is a victory lap: clip per obstacle, because the section
    // straddling the boundary starts before it and ends well past where the
    // craft comes to rest.
    return out.filter(o => o.position.z > OBSTACLES_END_Z);
};
