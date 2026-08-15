import { FIELD_WIDTH } from './obstacles';

export const planeSize = 1000;

/**
 * The journey, as two centreline functions of world z — one lateral, one
 * vertical. Purely visual: gameplay happens in a straight, flat logical
 * space, and everything on the track (rails, obstacles, craft, camera,
 * scenery) is shifted by these at render time, so relative positions are
 * exact and the fairness sweep is untouched by construction.
 *
 * Each is a gentle base wave plus a rare, large event gated by `surge` — a
 * long-period envelope raised to a power so it is quiet most of the time and
 * then opens into one sweeping bend, a climb toward the sky, or a dive to a
 * valley floor.
 */
const surge = (z: number, freq: number, phase: number) =>
    Math.pow(0.5 + 0.5 * Math.sin(z * freq + phase), 4);

export const trackCurve = (z: number) =>
    18 * Math.sin(z * 0.0033) +
    8 * Math.sin(z * 0.008) +
    55 * Math.sin(z * 0.0012) * surge(z, 0.00021, 0);

export const trackHeight = (z: number) =>
    16 * Math.sin(z * 0.0019) +
    7 * Math.sin(z * 0.0046) +
    48 * Math.sin(z * 0.0009) * surge(z, 0.00017, 2.1);

/** Numeric d/dz — the surge product makes analytic derivatives noise-prone. */
export const trackCurveSlope = (z: number) =>
    trackCurve(z + 0.5) - trackCurve(z - 0.5);

export const trackHeightSlope = (z: number) =>
    trackHeight(z + 0.5) - trackHeight(z - 0.5);
export const leftBound = -FIELD_WIDTH / 2;
export const rightBound = FIELD_WIDTH / 2;

// Nothing left to preload: every object in the scene is generated geometry.
// Kept as an empty list so the loading path still has one place to grow from
// if an asset is ever added back.
export const MODEL_PATHS: string[] = [];
