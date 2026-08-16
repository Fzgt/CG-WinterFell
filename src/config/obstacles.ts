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
export const OBSTACLES_PER_SECTION = 90;
export const FIELD_WIDTH = 120;
export const SECTION_LENGTH = 2000;

/**
 * Obstacle layout.
 *
 * Pumpkins used to be scattered uniformly at full density from the very first
 * metre, which made a run last a couple of seconds: with nothing guaranteeing
 * a way through, most deaths were to a wall the player could not have avoided.
 *
 * Instead each section is cut into bands, every band keeps one clear lane, and
 * the lane only drifts so far between bands so it stays reachable at speed.
 * Density then ramps with distance, so the opening is readable and the late
 * game is as dense as it always was.
 */
/**
 * Collision footprint of an obstacle at scale 1. Each one multiplies this by
 * its own width, so a wide slab is genuinely harder to squeeze past than a
 * thin spire — the hitbox follows what is drawn.
 */
export const OBSTACLE_BASE_RADIUS = 4.6;

export const BAND_DEPTH = 100;
/**
 * Half-width of the lane every formation keeps clear.
 *
 * This is the single number that decides how hard the route plays. At 17 the
 * fairness sweep measured its tightest passage anywhere on the route at 35
 * units — six craft widths — so nothing on the track ever asked for a line,
 * only for a direction. 12 lands those same passages around 24: still twice
 * what the sweep needs to call a section survivable, and now narrow enough
 * that a gate has to be aimed at.
 */
export const LANE_HALF_WIDTH = 12;
/** How far a band's clear lane may move from the previous band's. */
export const LANE_MAX_DRIFT = 26;
/**
 * Width of one placement column.
 *
 * A band is filled column by column rather than by dropping n blocks anywhere
 * across it: uniform random placement leaves holes, and holes that line up
 * from band to band are a free run down a single x. At 19 the field is six
 * columns wide, so a band still looks scattered — the blocks sit anywhere
 * inside their column and plenty of columns stay empty — but no x is empty
 * for a whole section by accident.
 */
export const COLUMN_WIDTH = 19;
/** Chance a column is occupied, at the start of the run and at full density. */
export const FILL_START = 0.5;
export const FILL_MAX = 0.86;
/**
 * Sections taken to ramp from the opening density to the full one.
 *
 * Six meant the field was still thinning itself out a third of the way into a
 * twenty-sector route. Four keeps the opening readable and has the track at
 * full density by the time the second palette arrives.
 */
export const DIFFICULTY_RAMP_SECTIONS = 4;
