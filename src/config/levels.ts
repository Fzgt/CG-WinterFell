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
}

/** A level with the speed the route runs it at. */
export interface Palette extends Level {
    speed: number;
}

export const LEVELS: Level[] = [
    { name: 'Signal', neon: '#00e5ff', accent: '#ffe066', fog: '#04121a' },
    { name: 'Vapour', neon: '#ff3ea5', accent: '#67ffe0', fog: '#170618' },
    { name: 'Circuit', neon: '#8b5cff', accent: '#ffd166', fog: '#0d0722' },
    { name: 'Ember', neon: '#ff7a1a', accent: '#7ae7ff', fog: '#190a04' },
    { name: 'Toxic', neon: '#7cff4d', accent: '#ff5fd2', fog: '#08160a' },
    { name: 'Nova', neon: '#ff2d55', accent: '#ffffff', fog: '#170410' },
];

/**
 * World units before the next level.
 *
 * Tuned twice: 2500 made the opening sector most of half a minute — long
 * enough for a first-time player to conclude the game had nothing else to
 * show them — and the 1300 that replaced it swung too far, changing palette
 * before a sector could establish itself. 1800 lands the first change around
 * the fifteen-second mark.
 */
export const LEVEL_DISTANCE = 1800;

/**
 * Levels repeat once the list runs out, but keep getting faster, so the run
 * stays endless without the palette sequence ever stopping.
 */
export const levelAt = (distance: number) =>
    Math.floor(Math.abs(distance) / LEVEL_DISTANCE);

/**
 * The final sector's own look: campus at night. Deep indigo air, silver
 * rails, champagne accents — deliberately apart from the neon cycle, so the
 * approach to UTS reads as arriving somewhere, not one more lap.
 */
const TERMINUS: Palette = {
    name: 'Terminus',
    neon: '#a9b8d8',
    accent: '#ffe9c4',
    fog: '#0a0d1c',
    // The arrival eases off: you are meant to look at the place, not fight it.
    speed: 24,
};

/**
 * Forward speed for a sector.
 *
 * This used to be a per-level figure with a per-lap bonus — six speeds from
 * 15 to 30, then +18 every lap — which suited the endless run it was written
 * for. On a route that is twenty sectors long it compounds: sector 19 came
 * out at 69, i.e. 4,140 units a second, where the whole 120-wide track sweeps
 * past in three hundredths of a second and the craft can cover 0.011 units
 * sideways per unit forward, a quarter of the opening. That is not a hard
 * level, it is an unplayable one, and no amount of layout fairness rescues
 * it. Speed now ramps once across the whole route and stops.
 */
const START_SPEED = 15;
const TOP_SPEED = 34;
export const speedFor = (level: number) =>
    Math.min(TOP_SPEED, START_SPEED + level);

export const paletteFor = (level: number): Palette => {
    if (level >= 19) return TERMINUS;
    return { ...LEVELS[level % LEVELS.length], speed: speedFor(level) };
};
