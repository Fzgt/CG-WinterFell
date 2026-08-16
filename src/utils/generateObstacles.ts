import * as THREE from 'three';
import { randomInRange2 } from './utils';
import { LATERAL_SPEED, OBSTACLES_END_Z } from '../config/constants';
import { levelAt, paletteFor } from '../config/levels';
import {
    OBSTACLE_BASE_RADIUS,
    FIELD_WIDTH,
    SECTION_LENGTH,
    BAND_DEPTH,
    LANE_HALF_WIDTH,
    LANE_MAX_DRIFT,
    OBSTACLES_PER_BAND_START,
    OBSTACLES_PER_BAND_MAX,
    DIFFICULTY_RAMP_SECTIONS,
    SLAB_HEIGHT,
    SPIRE_HEIGHT,
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
 * Sections rotate through four formations, so the field itself changes as a
 * run goes on instead of being one scatter pattern forever:
 *
 *  - scatter: loose random field with a wandering clear lane
 *  - gates:   low walls across the track with one opening to thread
 *  - slalom:  a winding canyon of spires
 *  - pillars: a loose grid of spires, offset row by row
 *
 * Every formation keeps the same contract: there is always a continuous lane
 * through, and how far that lane may shift per unit of forward travel stays
 * inside what the craft can actually steer (LATERAL_SPEED against the level's
 * forward speed). bench/fairness.mjs sweeps all of them.
 */
type Formation = 'scatter' | 'gates' | 'slalom' | 'pillars';

const FORMATIONS: Formation[] = ['scatter', 'gates', 'slalom', 'pillars'];

/** Deterministic 0..1 from an integer, so a section always looks like itself. */
const hashUnit = (n: number) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

/**
 * Which formation a section is built from.
 *
 * `section % 4` meant the route ran scatter, gates, slalom, pillars, scatter,
 * gates… for twenty sectors: every formation is a surprise exactly once, and
 * after that you know what the next two thousand units hold before you enter
 * them. Each section instead steps a random distance round the four, which
 * never lands on the one before it — so no formation repeats back to back, no
 * cycle survives, and the whole thing is still a pure function of the section
 * index, which the fairness sweep relies on. The opening is pinned to scatter:
 * the first sector is where the player finds out what the controls do, and it
 * should be the loose one.
 */
export const formationFor = (section: number): Formation => {
    let index = 0;
    for (let s = 1; s <= section; s++) {
        const step = 1 + Math.floor(hashUnit(s) * (FORMATIONS.length - 1));
        index = (index + step) % FORMATIONS.length;
    }
    return FORMATIONS[index];
};

const HALF_WIDTH = FIELD_WIDTH / 2;
const LANE_LIMIT = HALF_WIDTH - LANE_HALF_WIDTH;

const sectionBounds = (section: number): [number, number] =>
    section === 0
        ? [-250, -SECTION_LENGTH]
        : [-section * SECTION_LENGTH, -(section + 1) * SECTION_LENGTH];

const rampFor = (section: number) =>
    Math.min(section / DIFFICULTY_RAMP_SECTIONS, 1);

/**
 * Lateral units the craft can cover per unit of forward travel, at the speed
 * the level owning this section runs at.
 *
 * This is the number every formation has to respect. It shrinks as the run
 * speeds up — at the opening 15 the craft moves 0.049 sideways per unit
 * forward, by the sixth level only 0.024 — so a lane that wanders 26 units
 * between bands, fine at the speeds this game shipped with, becomes a lane
 * the player physically cannot follow. bench/fairness.mjs measures the same
 * ratio, per section, for exactly this reason.
 */
const reachFor = (section: number) => {
    const z = -section * SECTION_LENGTH;
    return LATERAL_SPEED / (paletteFor(levelAt(z)).speed * 60);
};

/**
 * Fraction of the theoretical reach a layout may demand. The rest is the
 * player's: reaction time, the craft's easing onto its lane target, and the
 * fact that nobody threads a gap by arriving exactly at its edge.
 */
const FOLLOW = 0.55;

/* --------------------------------------------------------------- shapes -- */

interface Shape {
    width: number;
    height: number;
    depth: number;
    rotationY: number;
}

/** Low and wide: you steer around it, and you see over it. */
const slab = (): Shape => ({
    width: randomInRange2(1.6, 2.8),
    height: randomInRange2(SLAB_HEIGHT.min, SLAB_HEIGHT.max),
    depth: randomInRange2(0.7, 1.6),
    rotationY: randomInRange2(-0.5, 0.5),
});

/** Tall and thin: you steer around it, and you see past it. */
const spire = (): Shape => ({
    width: randomInRange2(0.55, 1.3),
    height: randomInRange2(SPIRE_HEIGHT.min, SPIRE_HEIGHT.max),
    depth: randomInRange2(0.6, 1.4),
    rotationY: randomInRange2(-0.4, 0.4),
});

const someShape = (slabChance: number) =>
    Math.random() < slabChance ? slab() : spire();

const place = (shape: Shape, x: number, z: number): Obstacle => ({
    position: new THREE.Vector3(x, 0, z),
    scale: new THREE.Vector3(shape.width, shape.height, shape.depth),
    rotationY: shape.rotationY,
    radius: OBSTACLE_BASE_RADIUS * shape.width,
});

/**
 * How far this block's centre has to sit from the lane centre.
 *
 * Its own footprint plus the lane, because a 2.8-wide slab carries a 12.9
 * radius: one placed just outside a nominal 15-unit lane reaches most of the
 * way back across it. The lane has to be as wide to fly as it is to look at.
 */
const clearFor = (shape: Shape) =>
    LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * shape.width;

/* ------------------------------------------------------------- coverage -- */

/** Width of one tally bin, well under an obstacle's own footprint. */
const BIN_WIDTH = 4;
const BINS = Math.ceil(FIELD_WIDTH / BIN_WIDTH);

/**
 * How much of the section each part of the track has seen so far.
 *
 * Uniform random placement is what makes a field read as scattered, and also
 * what leaves an x nobody ever stood in: over twenty bands some strip comes up
 * empty every time, and a strip empty for a whole section is a straight line
 * down which the section flies itself — the sweep measures runs of thirty-odd
 * units that way, on a field that looks perfectly busy.
 *
 * Closing those by adding blocks is how a track ends up unplayable. Keep the
 * count and choose better instead: draw a few legal spots and take the one in
 * the emptiest strip. Three candidates, not the best of everything — picking
 * the global optimum every time spaces the field into a lattice, which is the
 * wallpaper problem wearing a different hat.
 */
const coverage = () => {
    const bins = new Int32Array(BINS);
    const binAt = (x: number) =>
        THREE.MathUtils.clamp(
            Math.floor((x + HALF_WIDTH) / BIN_WIDTH),
            0,
            BINS - 1,
        );
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
    laneX: number,
): number | null => {
    const clear = clearFor(shape);
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

/* ----------------------------------------------------------------- lane -- */

/**
 * A clear lane that sweeps instead of jittering.
 *
 * Every formation used to move its lane by a signed random amount per band,
 * which is a random walk: the steps are as large as the craft can follow, but
 * they cancel, so over a whole 2000-unit section the lane ended up within a
 * few units of where it started — one x held for the entire section, no input
 * required, on a track whose whole difficulty budget was being spent on steps
 * that undid each other.
 *
 * Holding a direction for a while spends exactly the same per-band budget, so
 * nothing here asks for lateral speed the craft does not have, but the lane
 * actually travels. How long it holds scales with the step rather than being
 * a fixed number of bands: what breaks a straight line is the lane moving
 * further than its own width, and that takes a crossing, not three bands.
 */
const laneSweeper = (start: number, maxStep: number) => {
    let x = THREE.MathUtils.clamp(start, -LANE_LIMIT, LANE_LIMIT);
    let dir = Math.random() < 0.5 ? -1 : 1;
    // Stated in track rather than in bands, so the hold stays right whatever
    // the speed and spacing of the formation using it.
    const crossing = Math.max(3, LANE_LIMIT / maxStep);
    const newHold = () => Math.round(randomInRange2(0.6, 1.1) * crossing);
    let hold = newHold();

    return () => {
        // Steps vary, so the lane reads as drifting rather than as a ramp.
        const step = randomInRange2(0.55, 1) * maxStep;
        // Turn when the run is spent, or at the boundary — otherwise the lane
        // parks against the edge and is a straight line again.
        const next = x + dir * step;
        if (hold <= 0 || next < -LANE_LIMIT || next > LANE_LIMIT) {
            dir = -dir;
            hold = newHold();
        }
        hold--;
        x = THREE.MathUtils.clamp(x + dir * step, -LANE_LIMIT, LANE_LIMIT);
        return x;
    };
};

/* ------------------------------------------------------------- scatter -- */

const scatter = (
    startZ: number,
    endZ: number,
    ramp: number,
    playerX: number,
    reach: number,
): Obstacle[] => {
    const out: Obstacle[] = [];
    const perBand = Math.round(
        OBSTACLES_PER_BAND_START +
            (OBSTACLES_PER_BAND_MAX - OBSTACLES_PER_BAND_START) * ramp,
    );

    const depth = Math.abs(endZ - startZ);
    const bands = Math.max(1, Math.round(depth / BAND_DEPTH));
    // The lane may only move as far between bands as the craft can follow.
    const nextLane = laneSweeper(
        playerX,
        Math.min(LANE_MAX_DRIFT, BAND_DEPTH * reach * FOLLOW),
    );
    const tally = coverage();

    for (let band = 0; band < bands; band++) {
        const bandStartZ = startZ - (depth * band) / bands;
        const bandEndZ = startZ - (depth * (band + 1)) / bands;
        const laneX = nextLane();

        for (let i = 0; i < perBand; i++) {
            // Size the block first: the lane has to clear this obstacle's own
            // footprint, not a nominal centre distance. A 2.8-wide slab
            // carries a 12.9 radius, so one placed just outside the nominal
            // lane reached 13 units into it — the lane looked 34 wide and
            // played 8 wide, which is what "that one was impossible" was.
            const shape = someShape(0.35);
            const x = spread(tally, shape, laneX);
            if (x === null) continue;

            out.push(place(shape, x, randomInRange2(bandStartZ, bandEndZ)));
        }
    }
    return out;
};

/* --------------------------------------------------------------- gates -- */

const gates = (
    startZ: number,
    endZ: number,
    ramp: number,
    playerX: number,
    reach: number,
): Obstacle[] => {
    const out: Obstacle[] = [];
    // Rows get a little closer as the run ramps, never closer than the craft
    // can re-steer between (drift below stays inside lateral reach).
    const spacing = 275 - ramp * 55;
    // The gap sweeps rather than jitters, so a run of gates pulls the same way
    // for a while instead of sitting at the same x wall after wall.
    const nextLane = laneSweeper(
        playerX,
        Math.min(11, spacing * reach * FOLLOW),
    );
    const slabWidth = 2.3; // ×7 units
    // The gap clears the slabs' own footprint, not their centres.
    const gateClear = LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * slabWidth;

    for (let z = startZ - spacing / 2; z > endZ; z -= spacing) {
        const laneX = nextLane();

        // A wall of wide slabs with one gap at the lane, and a low one: this
        // is the formation that spans the whole field, so standing it tall
        // would put a hoarding across the horizon every few seconds.
        const step = slabWidth * 7 + 2;
        for (let x = -HALF_WIDTH + step / 2; x < HALF_WIDTH; x += step) {
            // Jitter first, test after: a slab nudged off its nominal place
            // after the gap was measured is a slab standing in the gap.
            const jittered = x + randomInRange2(-3, 3);
            if (Math.abs(jittered - laneX) < gateClear) continue;
            const shape = slab();
            shape.width = slabWidth;
            out.push(place(shape, jittered, z + randomInRange2(-6, 6)));
        }
    }
    return out;
};

/* -------------------------------------------------------------- slalom -- */

const slalom = (
    startZ: number,
    endZ: number,
    ramp: number,
    reach: number,
): Obstacle[] => {
    const out: Obstacle[] = [];
    const step = 64;
    /**
     * The canyon used to wind as a sine of absolute z, with a fixed amplitude
     * and a frequency squeezed down until the slope fitted inside the craft's
     * lateral reach. That trade is the wrong way round: hold the amplitude and
     * the period stretches, so at the speeds the late route runs at one period
     * came to nine sections and the "winding" canyon ran dead straight through
     * any one of them — the sweep measured sector 10 as the same fixed
     * corridor in every layout it generated, because nothing about that lane
     * was random. The sweeper spends the same budget in one direction, which
     * is what actually moves a lane across a field.
     */
    const nextLane = laneSweeper(
        0,
        Math.min(LANE_MAX_DRIFT, step * reach * FOLLOW),
    );
    /**
     * Two spires mark the lane edge; the outfield gets a block or two per row,
     * not a wall.
     *
     * With the outfield empty the canyon is decoration — sit at either
     * boundary and the whole section flies itself in a straight line. Filling
     * it with a solid run of slabs closed that off but put a continuous
     * hoarding either side of the player, and the scenery this game spends
     * most of its triangles on disappeared behind it. A scattering is enough:
     * crossing the outfield only has to be expensive, not impossible, and the
     * lane stays the cheap way through.
     */
    const litter = 1 + Math.round(ramp);
    const tally = coverage();

    for (let z = startZ; z > endZ; z -= step) {
        const laneX = nextLane();

        // The lane edges: a pair per row, clearing their own footprint so the
        // canyon is as wide to fly as it is to look at.
        for (const side of [-1, 1]) {
            const shape = spire();
            const x = laneX + side * (clearFor(shape) + Math.random() * 6);
            if (Math.abs(x) > HALF_WIDTH) continue;
            tally.mark(x, OBSTACLE_BASE_RADIUS * shape.width);
            out.push(place(shape, x, z + randomInRange2(-8, 8)));
        }

        // Outfield: low blocks, dropped where the section has been emptiest,
        // so crossing it costs something without it becoming a wall.
        for (let i = 0; i < litter; i++) {
            const shape = someShape(0.8);
            const x = spread(tally, shape, laneX);
            if (x !== null) out.push(place(shape, x, z + randomInRange2(-30, 30)));
        }
    }
    return out;
};

/* ------------------------------------------------------------- pillars -- */

const pillars = (
    startZ: number,
    endZ: number,
    ramp: number,
    reach: number,
): Obstacle[] => {
    const out: Obstacle[] = [];
    const rowSpacing = 135 - ramp * 20;
    const colSpacing = 30;
    const nextLane = laneSweeper(0, Math.min(8, rowSpacing * reach * FOLLOW));
    let row = 0;

    for (let z = startZ - rowSpacing / 2; z > endZ; z -= rowSpacing, row++) {
        const laneX = nextLane();
        const offset = row % 2 === 0 ? 0 : colSpacing / 2;

        for (let x = -HALF_WIDTH + offset; x <= HALF_WIDTH; x += colSpacing) {
            const shape = spire();
            // The grid is where the spires belong, not where they stand. A
            // ruler-straight lattice reads as wallpaper rather than as
            // something to fly through; a third of the spacing of jitter keeps
            // the coverage and loses the pattern. Clearance is tested on the
            // jittered position — testing the grid position and then moving
            // the spire is how one ends up inside the lane.
            const jittered = x + randomInRange2(-colSpacing / 3, colSpacing / 3);
            if (Math.abs(jittered - laneX) < clearFor(shape)) continue;
            out.push(
                place(
                    shape,
                    jittered,
                    z + randomInRange2(-rowSpacing / 5, rowSpacing / 5),
                ),
            );
        }
    }
    return out;
};

/* ---------------------------------------------------------------- entry -- */

export const generateSectionObstacles = (
    section: number,
    playerX = 0,
): Obstacle[] => {
    const [startZ, endZ] = sectionBounds(section);
    if (startZ <= OBSTACLES_END_Z) return [];
    const ramp = rampFor(section);
    const reach = reachFor(section);

    const formation = formationFor(section);
    const obstacles =
        formation === 'gates'
            ? gates(startZ, endZ, ramp, playerX, reach)
            : formation === 'slalom'
              ? slalom(startZ, endZ, ramp, reach)
              : formation === 'pillars'
                ? pillars(startZ, endZ, ramp, reach)
                : scatter(startZ, endZ, ramp, playerX, reach);

    // The finish is a victory lap: clip per obstacle, because the section
    // straddling the boundary starts before it and ends well past where the
    // craft comes to rest.
    return obstacles.filter(o => o.position.z > OBSTACLES_END_Z);
};
