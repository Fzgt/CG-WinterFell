import * as THREE from 'three';

// PumpkinField.tsx
export const TOTAL_SECTIONS = 100;
export const VISIBLE_SECTIONS = 3;

export const DISTANCE_COLORS = [
    { distance: 0, color: new THREE.Color('#FF8C00') }, // Orange
    { distance: 4000, color: new THREE.Color('#32CD32') }, // Green
    { distance: 10000, color: new THREE.Color('#888888') }, // Brown
    { distance: 18000, color: new THREE.Color('#222222') }, // Black
];

// PumpkinSection.tsx
export const PUMPKIN_COUNT_PER_SECTION = 250;
export const FIELD_WIDTH = 1000;
export const SECTION_LENGTH = 2000;
