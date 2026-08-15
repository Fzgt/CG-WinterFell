/**
 * The route's scenery, decoupled from levels.
 *
 * Levels keep owning palette and speed (six of them, cycling); scenes own
 * what stands beside — or above, or around — the track, and there are twenty,
 * cycling on the same 1800-unit stride. Six palettes against twenty scenes
 * means the pairing drifts every lap, so the same shore returns under a
 * different sky.
 *
 * `a` is the scene's primary glow, `b` a secondary; builders are free to
 * use them or ignore them.
 */
export type SceneKind =
    | 'city'
    | 'ocean'
    | 'tunnel'
    | 'harbor'
    | 'mountains'
    | 'crystal'
    | 'colossi'
    | 'lattice'
    | 'volcano'
    | 'forest'
    | 'ruins'
    | 'windfarm'
    | 'pyramids'
    | 'arches'
    | 'ribcage'
    | 'floating'
    | 'falls'
    | 'mushroom';

export interface SceneSpec {
    kind: SceneKind;
    name: string;
    a: string;
    b: string;
    /** Kind-specific switches, e.g. snow on mountains, moon on ocean. */
    variant?: string;
}

export const SCENES: SceneSpec[] = [
    { kind: 'city', name: 'Neon City', a: '#00e5ff', b: '#ff3b4d' },
    { kind: 'ocean', name: 'Lighthouse Coast', a: '#9fd8ff', b: '#ff5f45' },
    { kind: 'mountains', name: 'Violet Range', a: '#8b5cff', b: '#aebbdd', variant: 'snow' },
    { kind: 'tunnel', name: 'Abyss Tunnel', a: '#2de2ff', b: '#7dffb2' },
    { kind: 'harbor', name: 'Iron Harbor', a: '#ffd166', b: '#ff3b4d' },
    { kind: 'crystal', name: 'Crystal Plains', a: '#ffc37a', b: '#67ffe0' },
    { kind: 'colossi', name: 'The Watchers', a: '#7ae7ff', b: '#ffe066' },
    { kind: 'mountains', name: 'Glacier Pass', a: '#bfeaff', b: '#e8f4ff', variant: 'ice' },
    { kind: 'lattice', name: 'Pylon Fields', a: '#ffb066', b: '#ff3b4d' },
    { kind: 'volcano', name: 'Ember Peaks', a: '#ff7a1a', b: '#ff2d55' },
    { kind: 'forest', name: 'Neon Grove', a: '#7cff4d', b: '#2de2ff' },
    { kind: 'ruins', name: 'Fallen Empire', a: '#d8c9a3', b: '#ffb066' },
    { kind: 'windfarm', name: 'Turbine Steppe', a: '#e8f4ff', b: '#ff3b4d' },
    { kind: 'pyramids', name: 'Dune Monoliths', a: '#ffd166', b: '#67ffe0' },
    { kind: 'arches', name: 'Gate of Giants', a: '#b44dff', b: '#2de2ff' },
    { kind: 'ribcage', name: 'Leviathan Graveyard', a: '#e6e9f2', b: '#7dffb2' },
    { kind: 'floating', name: 'Sky Isles', a: '#67ffe0', b: '#ffc37a' },
    { kind: 'falls', name: 'Cascade Walls', a: '#9fd8ff', b: '#2de2ff' },
    { kind: 'mushroom', name: 'Spore Hollow', a: '#ff5fd2', b: '#7cff4d' },
    { kind: 'ocean', name: 'Moonlit Sea', a: '#e8f4ff', b: '#ffd166', variant: 'moon' },
];

export const SCENE_DISTANCE = 1800;

export const sceneAt = (z: number): SceneSpec =>
    SCENES[Math.floor(Math.abs(z) / SCENE_DISTANCE) % SCENES.length];
