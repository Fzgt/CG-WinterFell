import * as THREE from 'three';

// ObstacleField.tsx
export const VISIBLE_SECTIONS = 3;

export const DISTANCE_COLORS = [
    { distance: 0, color: new THREE.Color('#FF8C00') }, // Orange
    { distance: 4000, color: new THREE.Color('#32CD32') }, // Green
    { distance: 10000, color: new THREE.Color('#888888') }, // Brown
    { distance: 18000, color: new THREE.Color('#222222') }, // Black
];

// ObstacleSection.tsx
export const FIELD_WIDTH = 120;
export const SECTION_LENGTH = 2000;

/**
 * Obstacle layout.
 *
 * Pumpkins used to be scattered uniformly at full density from the very first
 * metre, which made a run last a couple of seconds: with nothing guaranteeing
 * a way through, most deaths were to a wall the player could not have avoided.
 *
 * Instead the whole route carries one clear lane whose sideways travel stays
 * inside what the craft can steer at the speed it is being flown at, and the
 * field around it is grown from continuous noise rather than laid out sector
 * by sector. Density then ramps with distance, so the opening is readable and
 * the late game is as dense as it always was.
 */
/**
 * Collision footprint of an obstacle at scale 1. Each one multiplies this by
 * its own width, so a wide slab is genuinely harder to squeeze past than a
 * thin spire — the hitbox follows what is drawn.
 */
export const OBSTACLE_BASE_RADIUS = 4.6;

/**
 * Depth of one slice of track.
 *
 * The field is not built out of bands with a layout each any more; it is one
 * continuous terrain sampled at this resolution, which is small enough that
 * the run's texture changes inside a sector rather than at its seams.
 */
export const SLICE_DEPTH = 50;

/**
 * Half-width of the clear lane, and how far that opens and closes along the
 * route.
 *
 * The single number that decides how hard the route plays, and the one worth
 * moving before any other. Difficulty bought here is free: the field keeps
 * exactly the number of blocks it had, they just leave a line that has to be
 * aimed at rather than a direction to hold. Difficulty bought by adding blocks
 * costs the view, the frame budget, and eventually the game — a field dense
 * enough to be interesting to look at is one nobody can fly.
 *
 * A fixed lane makes every stretch of the route play at one pitch. The route
 * breathes between these two instead — partly on noise, so it has moments, and
 * partly on how much ground the lane is covering: where the lane is crossing
 * the field there is work to do at any width, and where it has run into the
 * edge of the field and turned back the corridor closes up, because a corridor
 * that stands still is somewhere to park.
 */
export const LANE_HALF = { min: 11, max: 18 };

/**
 * Blocks scattered per slice, from the loosest stretch of track to the
 * densest — before the shoulders that bound the lane and the seal that closes
 * a column nothing else reached, which between them account for about a third
 * of a sector's blocks and do most of the work.
 *
 * Deliberately low. Scattered blocks are the least valuable thing on the
 * track: they fill the view and the frame budget, and a player steers round
 * them without the route having asked for anything. Spend the count where it
 * bounds the lane instead.
 */
export const BLOCKS_PER_SLICE = { min: 0.45, max: 1.35 };
/** Sections taken to ramp from the opening density to the full one. */
export const DIFFICULTY_RAMP_SECTIONS = 5;

/**
 * A block's silhouette, as multiples of the 7 × 13 × 7 base block.
 *
 * The camera's eye sits at y = 11 and every piece of scenery — ridges, arches,
 * spires, the lot — lives beyond x = 94, so anything both tall and broad is a
 * hoarding pulled across the horizon. Rather than allowing two named shapes
 * and hoping neither drifts, one rule covers every block ever placed:
 *
 *     width × height ≤ SILHOUETTE_BUDGET
 *
 * so height is bought with width. A block that stays under the eye line may be
 * seventeen units broad, because you see over it; one that stands twenty-two
 * units tall is under five units wide, because you see past it. There is no
 * setting of the dice that produces a wall.
 */
export const BLOCK_HEIGHT = { min: 0.42, max: 1.72 };
export const BLOCK_WIDTH = { min: 0.45, max: 2.5 };
export const SILHOUETTE_BUDGET = 1.05;
