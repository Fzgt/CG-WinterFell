import * as THREE from 'three';
import { randomInRange2 } from './utils';
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
): Obstacle[] => {
    const out: Obstacle[] = [];
    const perBand = Math.round(
        OBSTACLES_PER_BAND_START +
            (OBSTACLES_PER_BAND_MAX - OBSTACLES_PER_BAND_START) * ramp,
    );

    let laneX = THREE.MathUtils.clamp(playerX, -LANE_LIMIT, LANE_LIMIT);
    const depth = Math.abs(endZ - startZ);
    const bands = Math.max(1, Math.round(depth / BAND_DEPTH));

    for (let band = 0; band < bands; band++) {
        const bandStartZ = startZ - (depth * band) / bands;
        const bandEndZ = startZ - (depth * (band + 1)) / bands;

        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-LANE_MAX_DRIFT, LANE_MAX_DRIFT),
            -LANE_LIMIT,
            LANE_LIMIT,
        );

        for (let i = 0; i < perBand; i++) {
            let x = 0;
            let placed = false;
            for (let attempt = 0; attempt < 12 && !placed; attempt++) {
                x = randomInRange2(-HALF_WIDTH, HALF_WIDTH);
                placed = Math.abs(x - laneX) > LANE_HALF_WIDTH;
            }
            if (!placed) continue;

            const wide = Math.random() < 0.35;
            out.push(
                block(
                    x,
                    randomInRange2(bandStartZ, bandEndZ),
                    wide ? randomInRange2(1.6, 2.8) : randomInRange2(0.55, 1.3),
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
): Obstacle[] => {
    const out: Obstacle[] = [];
    // Rows get a little closer as the run ramps, never closer than the craft
    // can re-steer between (drift below stays inside lateral reach).
    const spacing = 300 - ramp * 60;
    let laneX = THREE.MathUtils.clamp(playerX, -LANE_LIMIT, LANE_LIMIT);

    for (let z = startZ - spacing / 2; z > endZ; z -= spacing) {
        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-11, 11),
            -LANE_LIMIT,
            LANE_LIMIT,
        );

        // A wall of wide slabs with one gap at the lane.
        const slabWidth = 2.3; // ×7 units
        const step = slabWidth * 7 + 2;
        for (let x = -HALF_WIDTH + step / 2; x < HALF_WIDTH; x += step) {
            if (Math.abs(x - laneX) < LANE_HALF_WIDTH + 8) continue;
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

const slalom = (startZ: number, endZ: number, ramp: number): Obstacle[] => {
    const out: Obstacle[] = [];
    // Lane swings as a sine of absolute z: slope stays well inside the
    // craft's lateral reach (amplitude · ω < LATERAL_SPEED / forward speed).
    const amplitude = LANE_LIMIT * (0.55 + ramp * 0.3);
    const omega = 0.0011;
    const laneAt = (z: number) => amplitude * Math.sin(Math.abs(z) * omega);

    const step = 70;
    for (let z = startZ; z > endZ; z -= step) {
        const laneX = laneAt(z);
        // Canyon walls hugging both sides of the lane.
        for (const side of [-1, 1]) {
            const x =
                laneX + side * (LANE_HALF_WIDTH + 6 + Math.random() * 8);
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

const pillars = (startZ: number, endZ: number, ramp: number): Obstacle[] => {
    const out: Obstacle[] = [];
    const rowSpacing = 150 - ramp * 20;
    const colSpacing = 30;
    let laneX = 0;
    let row = 0;

    for (let z = startZ - rowSpacing / 2; z > endZ; z -= rowSpacing, row++) {
        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-8, 8),
            -LANE_LIMIT,
            LANE_LIMIT,
        );
        const offset = row % 2 === 0 ? 0 : colSpacing / 2;

        for (
            let x = -HALF_WIDTH + offset;
            x <= HALF_WIDTH;
            x += colSpacing
        ) {
            if (Math.abs(x - laneX) < LANE_HALF_WIDTH) continue;
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
    // The final scene is a victory lap: the last stretch runs clean into
    // the doors of UTS, no obstacles on campus.
    if (startZ <= -34200) return [];
    const ramp = rampFor(section);

    switch (formationFor(section)) {
        case 'gates':
            return gates(startZ, endZ, ramp, playerX);
        case 'slalom':
            return slalom(startZ, endZ, ramp);
        case 'pillars':
            return pillars(startZ, endZ, ramp);
        default:
            return scatter(startZ, endZ, ramp, playerX);
    }
};
