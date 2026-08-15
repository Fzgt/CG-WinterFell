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
export const LANE_HALF_WIDTH = 17;
/** How far a band's clear lane may move from the previous band's. */
export const LANE_MAX_DRIFT = 26;
export const OBSTACLES_PER_BAND_START = 3;
export const OBSTACLES_PER_BAND_MAX = Math.round(
    OBSTACLES_PER_SECTION / (SECTION_LENGTH / BAND_DEPTH),
);
/** Sections taken to ramp from the opening density to the full one. */
export const DIFFICULTY_RAMP_SECTIONS = 6;
