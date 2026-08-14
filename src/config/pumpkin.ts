import * as THREE from 'three';

// PumpkinField.tsx
export const VISIBLE_SECTIONS = 3;

export const DISTANCE_COLORS = [
    { distance: 0, color: new THREE.Color('#FF8C00') }, // Orange
    { distance: 4000, color: new THREE.Color('#32CD32') }, // Green
    { distance: 10000, color: new THREE.Color('#888888') }, // Brown
    { distance: 18000, color: new THREE.Color('#222222') }, // Black
];

// PumpkinSection.tsx
export const PUMPKIN_COUNT_PER_SECTION = 260;
export const FIELD_WIDTH = 1000;
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
export const BAND_DEPTH = 125;
export const LANE_HALF_WIDTH = 95;
/** How far a band's clear lane may move from the previous band's. */
export const LANE_MAX_DRIFT = 150;
export const PUMPKINS_PER_BAND_START = 3;
export const PUMPKINS_PER_BAND_MAX = Math.round(
    PUMPKIN_COUNT_PER_SECTION / (SECTION_LENGTH / BAND_DEPTH),
);
/** Sections taken to ramp from the opening density to the full one. */
export const DIFFICULTY_RAMP_SECTIONS = 6;
