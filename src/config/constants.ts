import { FIELD_WIDTH } from './obstacles';

export const planeSize = 1000;

/**
 * The track's winding centreline, purely visual.
 *
 * Gameplay happens in a straight logical space — lanes, collisions and the
 * fairness sweep are untouched. At render time everything on the track
 * (rails, rungs, obstacles, craft, camera) shifts sideways by this curve at
 * its own z, so the whole world snakes together and relative positions are
 * preserved exactly. Amplitude keeps the track's far edge inside the city
 * setback; slope tops out around 8 degrees.
 */
export const trackCurve = (z: number) =>
    22 * Math.sin(z * 0.0033) + 8 * Math.sin(z * 0.008);

/** d(trackCurve)/dz, for yawing geometry along the bend. */
export const trackCurveSlope = (z: number) =>
    22 * 0.0033 * Math.cos(z * 0.0033) + 8 * 0.008 * Math.cos(z * 0.008);
export const leftBound = -FIELD_WIDTH / 2;
export const rightBound = FIELD_WIDTH / 2;

// Nothing left to preload: every object in the scene is generated geometry.
// Kept as an empty list so the loading path still has one place to grow from
// if an asset is ever added back.
export const MODEL_PATHS: string[] = [];
