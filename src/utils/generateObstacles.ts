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
    COLUMN_WIDTH,
    FILL_START,
    FILL_MAX,
    DIFFICULTY_RAMP_SECTIONS,
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
 *  - gates:   walls across the track with one opening to thread
 *  - slalom:  a winding canyon hugging a sinusoidal lane
 *  - pillars: a regular grid of spires, offset row by row
 *
 * Every formation keeps the same contract: there is always a continuous lane
 * through, and how far that lane may shift per unit of forward travel stays
 * inside what the craft can actually steer (LATERAL_SPEED against the level's
 * forward speed). bench/fairness.mjs sweeps all of them.
 */
type Formation = 'scatter' | 'gates' | 'slalom' | 'pillars';

const FORMATIONS: Formation[] = ['scatter', 'gates', 'slalom', 'pillars'];

export const formationFor = (section: number): Formation =>
    FORMATIONS[section % FORMATIONS.length];

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
const FOLLOW = 0.65;

/* --------------------------------------------------------------- shapes -- */

/**
 * A block is either low and wide or tall and thin. Never both.
 *
 * The camera's eye sits at y = 11 and every piece of scenery — ridges,
 * arches, spires, the lot — lives beyond x = 94. Anything both tall and
 * broad is therefore a hoarding pulled across the horizon: the canyon walls
 * this file built for a while stood 18–34 high and 16 across, and they hid
 * the entire outfield behind them. A slab tops out around 8, under the eye
 * line, so you see over it; a spire reaches 40 but is only ~6 across, so you
 * see past it. Difficulty is a question of where the blocks are, never of how
 * much sky they take.
 */
type Kind = 'slab' | 'spire';

interface Shape {
    width: number;
    height: number;
    depth: number;
    rotationY: number;
}

const shapeOf = (kind: Kind): Shape =>
    kind === 'slab'
        ? {
              width: randomInRange2(1.7, 3.0),
              height: randomInRange2(0.34, 0.62),
              depth: randomInRange2(0.7, 1.7),
              rotationY: randomInRange2(-0.6, 0.6),
          }
        : {
              width: randomInRange2(0.45, 0.95),
              height: randomInRange2(1.7, 3.1),
              depth: randomInRange2(0.45, 1.0),
              rotationY: randomInRange2(-0.4, 0.4),
          };

const someShape = (slabChance: number) =>
    shapeOf(Math.random() < slabChance ? 'slab' : 'spire');

const place = (shape: Shape, x: number, z: number): Obstacle => ({
    position: new THREE.Vector3(x, 0, z),
    scale: new THREE.Vector3(shape.width, shape.height, shape.depth),
    rotationY: shape.rotationY,
    radius: OBSTACLE_BASE_RADIUS * shape.width,
});

/**
 * How far this block's centre has to sit from the lane centre.
 *
 * Its own footprint plus the lane, because a 3.0-wide slab carries a 13.8
 * radius: one placed just outside a nominal 12-unit lane reaches most of the
 * way back across it. The lane has to be as wide to fly as it is to look at.
 */
const clearFor = (shape: Shape) =>
    LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * shape.width;

/* ----------------------------------------------------------------- lane -- */

/** Where the guaranteed-clear lane sat, sampled down the section. */
interface LaneSample {
    z: number;
    x: number;
}

interface Layout {
    obstacles: Obstacle[];
    lane: LaneSample[];
}

/**
 * A clear lane that sweeps instead of jittering.
 *
 * Every formation used to move its lane by a signed random amount per band,
 * which is a random walk: the steps are as large as the craft can follow, but
 * they cancel, so over a whole 2000-unit section the lane ended up within a
 * few units of where it started. That is the "you left me a corridor and I
 * just flew down it" complaint — one x held for the entire section, no input
 * required, on a track whose whole difficulty budget was being spent on steps
 * that undid each other.
 *
 * Holding a direction spends exactly the same per-band budget — so nothing
 * here asks for lateral speed the craft does not have — but the lane actually
 * crosses the field, and no fixed x survives it.
 *
 * How long it holds has to scale with the step, not be a fixed number of
 * bands. What breaks a straight line is the lane travelling further than its
 * own width; a few bands of a 2.7-unit step moves it 13, and a 32-wide clear
 * lane still has 20 units common to every band of the section — measurably a
 * corridor, which is exactly what the sweep reported. A run long enough to
 * carry the lane most of the way to the boundary leaves nothing in common.
 */
const laneSweeper = (start: number, maxStep: number) => {
    let x = THREE.MathUtils.clamp(start, -LANE_LIMIT, LANE_LIMIT);
    let dir = Math.random() < 0.5 ? -1 : 1;
    // Steps needed to cross from the middle to the edge, so the hold is stated
    // in track rather than in bands and stays right at any speed or spacing.
    const crossing = Math.max(3, LANE_LIMIT / maxStep);
    // Never shorter than three quarters of a crossing: a run that turns back
    // early leaves the bands either side of the turn overlapping, and that
    // overlap is the corridor.
    const newHold = () => Math.round(randomInRange2(0.75, 1.25) * crossing);
    let hold = newHold();

    return () => {
        const step = randomInRange2(0.7, 1) * maxStep;
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
): Layout => {
    const out: Obstacle[] = [];
    const lane: LaneSample[] = [];
    // Bands are filled by column rather than by throwing n blocks anywhere in
    // the band. Uniform random placement leaves holes, and a hole that
    // happens to line up band after band is a free run down one x — with 4
    // blocks scattered over a 120-wide band there were plenty. Walking the
    // columns and skipping some of them looks just as irregular but cannot
    // leave a lane nobody asked for: a column has to come up empty twenty
    // times running to make one.
    const columns = Math.max(1, Math.round(FIELD_WIDTH / COLUMN_WIDTH));
    const fill =
        FILL_START + (FILL_MAX - FILL_START) * ramp;

    const depth = Math.abs(endZ - startZ);
    const bands = Math.max(1, Math.round(depth / BAND_DEPTH));
    // The lane may only move as far between bands as the craft can follow.
    const nextLane = laneSweeper(
        playerX,
        Math.min(LANE_MAX_DRIFT, BAND_DEPTH * reach * FOLLOW),
    );

    for (let band = 0; band < bands; band++) {
        const bandStartZ = startZ - (depth * band) / bands;
        const bandEndZ = startZ - (depth * (band + 1)) / bands;
        const laneX = nextLane();
        lane.push({ z: (bandStartZ + bandEndZ) / 2, x: laneX });

        for (let column = 0; column < columns; column++) {
            if (Math.random() > fill) continue;

            // Size the block first: how far it has to sit from the lane
            // depends on its own footprint.
            const shape = someShape(0.45);
            const clear = clearFor(shape);
            const from = -HALF_WIDTH + COLUMN_WIDTH * column;

            let x = 0;
            let placed = false;
            for (let attempt = 0; attempt < 8 && !placed; attempt++) {
                x = randomInRange2(from, from + COLUMN_WIDTH);
                placed = Math.abs(x - laneX) > clear;
            }
            if (!placed) continue;

            out.push(place(shape, x, randomInRange2(bandStartZ, bandEndZ)));
        }
    }
    return { obstacles: out, lane };
};

/* --------------------------------------------------------------- gates -- */

const gates = (
    startZ: number,
    endZ: number,
    ramp: number,
    playerX: number,
    reach: number,
): Layout => {
    const out: Obstacle[] = [];
    const lane: LaneSample[] = [];
    // Rows get a little closer as the run ramps, never closer than the craft
    // can re-steer between (drift below stays inside lateral reach). At the
    // old 300–240 a wall arrived every four seconds and the gap between two
    // of them had usually not moved far enough to need a correction; this
    // puts them close enough together to read as a sequence.
    const spacing = 235 - ramp * 55;
    // The gap may only move between walls as far as the craft can follow, and
    // it sweeps rather than jitters, so consecutive gates pull the same way
    // for a while instead of cancelling each other out.
    const nextLane = laneSweeper(playerX, Math.min(11, spacing * reach * FOLLOW));

    /**
     * The wall is a row of posts, not a row of billboards.
     *
     * It used to be 16-unit slabs standing up to 19 high — solid enough that
     * a gate blanked the horizon on approach. Posts overlap footprints just
     * as thoroughly, so there is still exactly one way through, but between
     * them you can see the outfield, which is the whole reason the scenery
     * is modelled.
     */
    const postWidth = 0.9; // ×7 units
    const postRadius = OBSTACLE_BASE_RADIUS * postWidth;
    // Under a footprint's diameter, so consecutive posts leave no seam.
    const step = postRadius * 1.75;
    const gateClear = LANE_HALF_WIDTH + postRadius;

    for (let z = startZ - spacing / 2; z > endZ; z -= spacing) {
        const laneX = nextLane();
        lane.push({ z, x: laneX });

        for (let x = -HALF_WIDTH + step / 2; x < HALF_WIDTH; x += step) {
            // Jitter first, test after: a post nudged off its nominal place
            // after the gap was measured is a post standing in the gap.
            const jittered = x + randomInRange2(-1.2, 1.2);
            if (Math.abs(jittered - laneX) < gateClear) continue;
            out.push(
                place(
                    {
                        width: postWidth,
                        height: randomInRange2(1.9, 3.1),
                        depth: randomInRange2(0.6, 1.0),
                        rotationY: randomInRange2(-0.25, 0.25),
                    },
                    jittered,
                    z + randomInRange2(-5, 5),
                ),
            );
        }
    }
    return { obstacles: out, lane };
};

/* -------------------------------------------------------------- slalom -- */

const slalom = (
    startZ: number,
    endZ: number,
    ramp: number,
    reach: number,
): Layout => {
    const out: Obstacle[] = [];
    const lane: LaneSample[] = [];
    const step = 52;
    /**
     * The canyon used to wind as a sine of absolute z, with a fixed amplitude
     * and a frequency squeezed down until the slope fitted inside the craft's
     * lateral reach. That trade is the wrong way round: hold the amplitude and
     * the period stretches, so at the speeds the late route runs at one period
     * came to nine sections and the "winding" canyon ran dead straight through
     * any one of them. The sweep caught it — sector 10 was a fixed 19-unit
     * corridor in every layout generated, the same number every time, because
     * nothing about that lane was random.
     *
     * The same sweeper the other formations use spends the reach budget in one
     * direction instead of spreading it over a period, which is what actually
     * moves the lane across the field.
     */
    const nextLane = laneSweeper(0, Math.min(LANE_MAX_DRIFT, step * reach * FOLLOW));
    /**
     * The canyon is two rows of spires marking the lane, and an outfield that
     * is scattered rather than walled.
     *
     * Both earlier versions were wrong in opposite directions. One spire per
     * side left the whole outfield empty, so the canyon was optional: sit at
     * either boundary and the entire section flies itself in a straight line.
     * Filling the outfield with a solid run of slabs closed that off but put
     * a continuous hoarding either side of the player, and the scenery this
     * game spends most of its triangles on disappeared behind it.
     *
     * Marking the lane with spires and littering the rest keeps both: the
     * canyon still reads as a canyon, the outfield is expensive enough to
     * cross that the lane is worth flying, and none of it is tall and wide at
     * the same time, so the ridges stay visible throughout.
     */
    const edgeSpire = () => ({
        width: randomInRange2(0.55, 0.95),
        height: randomInRange2(2.0, 3.1),
        depth: randomInRange2(0.5, 0.9),
        rotationY: randomInRange2(-0.3, 0.3),
    });
    const columns = Math.max(1, Math.round(FIELD_WIDTH / COLUMN_WIDTH));
    const litter = 0.4 + ramp * 0.3;

    for (let z = startZ; z > endZ; z -= step) {
        const laneX = nextLane();
        lane.push({ z, x: laneX });

        // The lane edges: a pair per row, clearing their own footprint so the
        // canyon is as wide to fly as it is to look at.
        for (const side of [-1, 1]) {
            const shape = edgeSpire();
            out.push(
                place(
                    shape,
                    laneX + side * clearFor(shape),
                    z + randomInRange2(-5, 5),
                ),
            );
        }

        // Outfield. Same column walk as scatter, so it is irregular without
        // ever leaving a straight line open.
        for (let column = 0; column < columns; column++) {
            if (Math.random() > litter) continue;
            const shape = someShape(0.6);
            const clear = clearFor(shape);
            const from = -HALF_WIDTH + COLUMN_WIDTH * column;

            let x = 0;
            let placed = false;
            for (let attempt = 0; attempt < 8 && !placed; attempt++) {
                x = randomInRange2(from, from + COLUMN_WIDTH);
                placed = Math.abs(x - laneX) > clear;
            }
            if (placed) out.push(place(shape, x, z + randomInRange2(-24, 24)));
        }
    }
    return { obstacles: out, lane };
};

/* ------------------------------------------------------------- pillars -- */

const pillars = (
    startZ: number,
    endZ: number,
    ramp: number,
    reach: number,
): Layout => {
    const out: Obstacle[] = [];
    const lane: LaneSample[] = [];
    const rowSpacing = 118 - ramp * 18;
    const colSpacing = 24;
    const nextLane = laneSweeper(0, Math.min(8, rowSpacing * reach * FOLLOW));
    let row = 0;

    for (let z = startZ - rowSpacing / 2; z > endZ; z -= rowSpacing, row++) {
        const laneX = nextLane();
        lane.push({ z, x: laneX });
        const offset = row % 2 === 0 ? 0 : colSpacing / 2;

        for (let x = -HALF_WIDTH + offset; x <= HALF_WIDTH; x += colSpacing) {
            const shape = shapeOf('spire');
            // The grid is where the spires belong, not where they stand. A
            // ruler-straight lattice reads as a texture rather than as
            // something to fly through; jittering each one by a third of the
            // spacing keeps the coverage and loses the wallpaper. Clearance is
            // tested on the jittered position — testing the grid position and
            // then moving the spire is how one ends up inside the lane.
            const jittered = x + randomInRange2(-colSpacing / 3, colSpacing / 3);
            if (Math.abs(jittered - laneX) < clearFor(shape)) continue;
            out.push(
                place(
                    shape,
                    jittered,
                    z + randomInRange2(-rowSpacing / 4, rowSpacing / 4),
                ),
            );
        }
    }
    return { obstacles: out, lane };
};

/* ----------------------------------------------------------------- seal -- */

/** Free runs of x narrower than this are not a corridor anyone can fly. */
const CORRIDOR = 4;
/** Spacing of the spires used to seal one, under a footprint's diameter. */
const SEAL_STEP = 5;

/**
 * Close any x that survives the whole section untouched.
 *
 * "Is there a way through" and "does the player have to do anything" are
 * different questions, and the layouts only ever answered the first. Sweeping
 * the lane answers most of the second, but not the tail: a column that comes
 * up empty band after band, or a run of blocks that happen to sit either side
 * of the same x, still leaves a line down which the section flies itself —
 * measured at up to 21 units even after the lane crossed the field.
 *
 * So measure it and close it. Every free run of x wide enough to fly gets
 * spires dropped into it, at a z where the lane was far enough away that the
 * lane itself is untouched. Anything that cannot be sealed without narrowing
 * the lane is left alone: a section that flies itself beats one that cannot
 * be flown at all.
 */
const seal = (layout: Layout): Obstacle[] => {
    const { obstacles, lane } = layout;
    if (!lane.length || !obstacles.length) return obstacles;

    const free: [number, number][] = [];
    let runStart: number | null = null;
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += 1) {
        const covered = obstacles.some(o => Math.abs(o.position.x - x) < o.radius);
        if (!covered && runStart === null) runStart = x;
        if (covered && runStart !== null) {
            free.push([runStart, x]);
            runStart = null;
        }
    }
    if (runStart !== null) free.push([runStart, HALF_WIDTH]);

    const added: Obstacle[] = [];
    for (const [from, to] of free) {
        if (to - from < CORRIDOR) continue;
        for (let x = from + SEAL_STEP / 2; x < to; x += SEAL_STEP) {
            const shape = shapeOf('spire');
            const clear = clearFor(shape);
            // Furthest the lane ever got from this x — if even that is inside
            // the lane's clearance there is nowhere to stand.
            let best = lane[0];
            for (const s of lane) {
                if (Math.abs(s.x - x) > Math.abs(best.x - x)) best = s;
            }
            if (Math.abs(best.x - x) <= clear) continue;
            added.push(place(shape, x, best.z + randomInRange2(-8, 8)));
        }
    }
    return obstacles.concat(added);
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
    const layout =
        formation === 'gates'
            ? gates(startZ, endZ, ramp, playerX, reach)
            : formation === 'slalom'
              ? slalom(startZ, endZ, ramp, reach)
              : formation === 'pillars'
                ? pillars(startZ, endZ, ramp, reach)
                : scatter(startZ, endZ, ramp, playerX, reach);
    const obstacles = seal(layout);

    // The finish is a victory lap: clip per obstacle, because the section
    // straddling the boundary starts before it and ends well past where the
    // craft comes to rest.
    return obstacles.filter(o => o.position.z > OBSTACLES_END_Z);
};
