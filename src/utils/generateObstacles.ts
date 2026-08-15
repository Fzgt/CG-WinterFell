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
export interface Obstacle {
    position: THREE.Vector3;
    /** Non-uniform, so no two pylons are the same block. */
    scale: THREE.Vector3;
    rotationY: number;
    /** Footprint used for collision, derived from this one's own width. */
    radius: number;
}

export const generateSectionObstacles = (
    section: number,
    playerX = 0,
): Obstacle[] => {
    const positions: Obstacle[] = [];

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

            // Sizes vary a lot: squat wide slabs, thin tall spires, and
            // everything between. A field of identical blocks reads as a
            // pattern rather than a place.
            const wide = Math.random() < 0.35;
            const width = wide
                ? randomInRange2(1.6, 2.8)
                : randomInRange2(0.55, 1.3);
            const height = wide
                ? randomInRange2(0.5, 1.1)
                : randomInRange2(1.1, 2.6);
            const depth = randomInRange2(0.6, 1.6);

            positions.push({
                position: new THREE.Vector3(
                    x,
                    0,
                    randomInRange2(bandStartZ, bandEndZ),
                ),
                scale: new THREE.Vector3(width, height, depth),
                rotationY: randomInRange2(-0.5, 0.5),
                radius: OBSTACLE_BASE_RADIUS * width,
            });
        }
    }

    return positions;
};
