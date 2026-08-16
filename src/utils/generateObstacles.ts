import * as THREE from 'three';
import { randomInRange2 } from './utils';
import { CAMPUS_Z, LATERAL_SPEED } from '../config/constants';
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
const FOLLOW = 0.55;

const block = (
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotationY = 0,
): Obstacle => ({
    position: new THREE.Vector3(x, 0, z),
    scale: new THREE.Vector3(width, height, depth),
    rotationY,
    radius: OBSTACLE_BASE_RADIUS * width,
});

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

    let laneX = THREE.MathUtils.clamp(playerX, -LANE_LIMIT, LANE_LIMIT);
    const depth = Math.abs(endZ - startZ);
    const bands = Math.max(1, Math.round(depth / BAND_DEPTH));
    // The lane may only move as far between bands as the craft can follow.
    const maxDrift = Math.min(LANE_MAX_DRIFT, BAND_DEPTH * reach * FOLLOW);

    for (let band = 0; band < bands; band++) {
        const bandStartZ = startZ - (depth * band) / bands;
        const bandEndZ = startZ - (depth * (band + 1)) / bands;

        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-maxDrift, maxDrift),
            -LANE_LIMIT,
            LANE_LIMIT,
        );

        for (let i = 0; i < perBand; i++) {
            // Size the block first: the lane has to clear this obstacle's own
            // footprint, not a nominal centre distance. A 2.8-wide slab
            // carries a 12.9 radius, so one placed just outside the nominal
            // lane reached 13 units into it — the lane looked 34 wide and
            // played 8 wide, which is what "that one was impossible" was.
            const wide = Math.random() < 0.35;
            const width = wide
                ? randomInRange2(1.6, 2.8)
                : randomInRange2(0.55, 1.3);
            const clear = LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * width;

            let x = 0;
            let placed = false;
            for (let attempt = 0; attempt < 12 && !placed; attempt++) {
                x = randomInRange2(-HALF_WIDTH, HALF_WIDTH);
                placed = Math.abs(x - laneX) > clear;
            }
            if (!placed) continue;

            out.push(
                block(
                    x,
                    randomInRange2(bandStartZ, bandEndZ),
                    width,
                    wide ? randomInRange2(0.5, 1.1) : randomInRange2(1.1, 2.6),
                    randomInRange2(0.6, 1.6),
                    randomInRange2(-0.5, 0.5),
                ),
            );
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
    const spacing = 300 - ramp * 60;
    let laneX = THREE.MathUtils.clamp(playerX, -LANE_LIMIT, LANE_LIMIT);

    // The gap may only move between walls as far as the craft can follow.
    const rowDrift = Math.min(11, spacing * reach * FOLLOW);
    const slabWidth = 2.3; // ×7 units
    // The gap clears the slabs' own footprint, not their centres.
    const gateClear = LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * slabWidth;

    for (let z = startZ - spacing / 2; z > endZ; z -= spacing) {
        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-rowDrift, rowDrift),
            -LANE_LIMIT,
            LANE_LIMIT,
        );

        // A wall of wide slabs with one gap at the lane.
        const step = slabWidth * 7 + 2;
        for (let x = -HALF_WIDTH + step / 2; x < HALF_WIDTH; x += step) {
            if (Math.abs(x - laneX) < gateClear) continue;
            out.push(
                block(
                    x,
                    z + randomInRange2(-4, 4),
                    slabWidth,
                    randomInRange2(0.8, 1.5),
                    randomInRange2(0.7, 1.1),
                ),
            );
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
    // Lane swings as a sine of absolute z: slope stays well inside the
    // craft's lateral reach (amplitude · ω < LATERAL_SPEED / forward speed).
    const amplitude = LANE_LIMIT * (0.55 + ramp * 0.3);
    // Peak lane slope is amplitude x omega; hold it inside the reach.
    const omega = Math.min(0.0011, (reach * FOLLOW) / amplitude);
    const laneAt = (z: number) => amplitude * Math.sin(Math.abs(z) * omega);

    const step = 70;
    for (let z = startZ; z > endZ; z -= step) {
        const laneX = laneAt(z);
        // Canyon walls hugging both sides of the lane.
        for (const side of [-1, 1]) {
            // Wall spires run to 1.0 wide; clear their footprint as well,
            // or the canyon is narrower to fly than it is to look at.
            const x =
                laneX +
                side *
                    (LANE_HALF_WIDTH +
                        OBSTACLE_BASE_RADIUS +
                        Math.random() * 8);
            if (Math.abs(x) > HALF_WIDTH) continue;
            out.push(
                block(
                    x,
                    z + randomInRange2(-8, 8),
                    randomInRange2(0.6, 1.0),
                    randomInRange2(1.4, 2.6),
                    randomInRange2(0.8, 1.4),
                ),
            );
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
    const rowSpacing = 150 - ramp * 20;
    const colSpacing = 30;
    const rowDrift = Math.min(8, rowSpacing * reach * FOLLOW);
    // Spires run to 0.8 wide, so the lane clears their footprint too.
    const pillarClear = LANE_HALF_WIDTH + OBSTACLE_BASE_RADIUS * 0.8;
    let laneX = 0;
    let row = 0;

    for (let z = startZ - rowSpacing / 2; z > endZ; z -= rowSpacing, row++) {
        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-rowDrift, rowDrift),
            -LANE_LIMIT,
            LANE_LIMIT,
        );
        const offset = row % 2 === 0 ? 0 : colSpacing / 2;

        for (
            let x = -HALF_WIDTH + offset;
            x <= HALF_WIDTH;
            x += colSpacing
        ) {
            if (Math.abs(x - laneX) < pillarClear) continue;
            out.push(
                block(
                    x,
                    z,
                    randomInRange2(0.5, 0.8),
                    randomInRange2(1.6, 2.8),
                    randomInRange2(0.5, 0.8),
                    randomInRange2(-0.3, 0.3),
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
    if (startZ <= CAMPUS_Z) return [];
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

    // The final scene is a victory lap: clip per obstacle, because the
    // section straddling the boundary starts before the campus and ends
    // well past where the craft comes to rest.
    return obstacles.filter(o => o.position.z > CAMPUS_Z);
};
