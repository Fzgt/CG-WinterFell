import * as THREE from 'three';
import { randomInRange2 } from './utils';
import {
    FIELD_WIDTH,
    SECTION_LENGTH,
    BAND_DEPTH,
    LANE_HALF_WIDTH,
    LANE_MAX_DRIFT,
    OBSTACLES_PER_BAND_START,
    OBSTACLES_PER_BAND_MAX,
    DIFFICULTY_RAMP_SECTIONS,
} from '../config/obstacles';

/**
 * Obstacle layout for one section.
 *
 * Pumpkins used to be scattered uniformly at full density from the first
 * metre, so most runs ended in the first couple of seconds against a wall the
 * player could not have got through. Each section is now cut into bands, every
 * band keeps one clear lane, and the lane only drifts so far between bands so
 * it stays reachable at speed. Density ramps with distance, leaving the late
 * game as crowded as it always was.
 *
 * Kept separate from the component so the layout can be checked directly —
 * see bench/fairness.mjs, which walks the lane geometrically rather than
 * trying to infer fairness from playtests.
 */
export const generateSectionObstacles = (
    section: number,
    playerX = 0,
): THREE.Vector3[] => {
    const positions: THREE.Vector3[] = [];

    const sectionStartZ = section === 0 ? -250 : -section * SECTION_LENGTH;
    const sectionEndZ =
        section === 0 ? -SECTION_LENGTH : sectionStartZ - SECTION_LENGTH;

    const ramp = Math.min(section / DIFFICULTY_RAMP_SECTIONS, 1);
    const perBand = Math.round(
        OBSTACLES_PER_BAND_START +
            (OBSTACLES_PER_BAND_MAX - OBSTACLES_PER_BAND_START) * ramp,
    );

    const halfWidth = FIELD_WIDTH / 2;
    const laneLimit = halfWidth - LANE_HALF_WIDTH;
    // Start the lane where the player already is, so a section never opens
    // with its gap on the far side of the field.
    let laneX = THREE.MathUtils.clamp(playerX, -laneLimit, laneLimit);

    const depth = Math.abs(sectionEndZ - sectionStartZ);
    const bands = Math.max(1, Math.round(depth / BAND_DEPTH));

    for (let band = 0; band < bands; band++) {
        const bandStartZ = sectionStartZ - (depth * band) / bands;
        const bandEndZ = sectionStartZ - (depth * (band + 1)) / bands;

        laneX = THREE.MathUtils.clamp(
            laneX + randomInRange2(-LANE_MAX_DRIFT, LANE_MAX_DRIFT),
            -laneLimit,
            laneLimit,
        );

        for (let i = 0; i < perBand; i++) {
            // Rejection-sample around the lane; give up rather than spin if the
            // band is too crowded to fit another one outside it.
            let x = 0;
            let placed = false;
            for (let attempt = 0; attempt < 12 && !placed; attempt++) {
                x = randomInRange2(-halfWidth, halfWidth);
                placed = Math.abs(x - laneX) > LANE_HALF_WIDTH;
            }
            if (!placed) continue;

            positions.push(
                new THREE.Vector3(x, 1, randomInRange2(bandStartZ, bandEndZ)),
            );
        }
    }

    return positions;
};
