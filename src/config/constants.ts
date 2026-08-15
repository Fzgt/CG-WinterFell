import { FIELD_WIDTH } from './obstacles';

export const planeSize = 1000;
export const leftBound = -FIELD_WIDTH / 2;
export const rightBound = FIELD_WIDTH / 2;

// Nothing left to preload: every object in the scene is generated geometry.
// Kept as an empty list so the loading path still has one place to grow from
// if an asset is ever added back.
export const MODEL_PATHS: string[] = [];
