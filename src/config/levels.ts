/**
 * Levels are colour and speed, nothing else.
 *
 * The run is still endless; what changes every LEVEL_DISTANCE is the palette
 * the whole world is tinted with and how fast it comes at you. That gives a
 * long run visible chapters — you can tell someone you died on the red one —
 * without needing separate handcrafted stages.
 */
export interface Level {
    name: string;
    /** Grid, horizon and obstacle glow. */
    neon: string;
    /** Pickups, so they never blend into the obstacles. */
    accent: string;
    /** Fog and background; a dark, desaturated relative of `neon`. */
    fog: string;
    /** Forward speed for this level. */
    speed: number;
}

export const LEVELS: Level[] = [
    { name: 'Signal', neon: '#00e5ff', accent: '#ffe066', fog: '#04121a', speed: 12 },
    { name: 'Vapour', neon: '#ff3ea5', accent: '#67ffe0', fog: '#170618', speed: 15 },
    { name: 'Circuit', neon: '#8b5cff', accent: '#ffd166', fog: '#0d0722', speed: 18 },
    { name: 'Ember', neon: '#ff7a1a', accent: '#7ae7ff', fog: '#190a04', speed: 21 },
    { name: 'Toxic', neon: '#7cff4d', accent: '#ff5fd2', fog: '#08160a', speed: 24 },
    { name: 'Nova', neon: '#ff2d55', accent: '#ffffff', fog: '#170410', speed: 27 },
];

/**
 * World units before the next level.
 *
 * This was 2500, which at the opening speed is the better part of half a
 * minute on the same palette — long enough that a first-time player can
 * reasonably conclude the game has nothing else to show them and leave. The
 * first colour change now lands inside the first ten seconds or so.
 */
export const LEVEL_DISTANCE = 1300;

/**
 * Levels repeat once the list runs out, but keep getting faster, so the run
 * stays endless without the palette sequence ever stopping.
 */
export const levelAt = (distance: number) =>
    Math.floor(Math.abs(distance) / LEVEL_DISTANCE);

export const paletteFor = (level: number): Level => {
    const base = LEVELS[level % LEVELS.length];
    const laps = Math.floor(level / LEVELS.length);
    return laps === 0
        ? base
        : { ...base, speed: base.speed + laps * LEVELS.length * 3 };
};
