/**
 * The route's scenery, decoupled from levels.
 *
 * Levels keep owning palette and speed (six of them, cycling); scenes own
 * what stands beside — or above, or around — the track. Twenty scenes on the
 * 1800-unit stride, and the run does NOT loop: the last scene is a finale,
 * and past it the world stays in its afterglow.
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
    | 'rings'
    | 'colossi'
    | 'glacier'
    | 'lattice'
    | 'titangrove'
    | 'forest'
    | 'ruins'
    | 'windfarm'
    | 'monoliths'
    | 'arches'
    | 'ribcage'
    | 'floating'
    | 'falls'
    | 'mushroom'
    | 'finale';

export interface SceneSpec {
    kind: SceneKind;
    name: string;
    a: string;
    b: string;
}

export const SCENES: SceneSpec[] = [
    { kind: 'city', name: 'Neon City', a: '#00e5ff', b: '#ff3b4d' },
    { kind: 'ocean', name: 'Beacon Coast', a: '#9fd8ff', b: '#ff5f45' },
    { kind: 'mountains', name: 'Violet Range', a: '#8b5cff', b: '#cdb4ff' },
    { kind: 'tunnel', name: 'Abyss Tunnel', a: '#2de2ff', b: '#7dffb2' },
    { kind: 'harbor', name: 'Iron Harbor', a: '#ffd166', b: '#ff3b4d' },
    { kind: 'rings', name: 'Halo Fields', a: '#67ffe0', b: '#ffc37a' },
    { kind: 'colossi', name: 'The Watchers', a: '#7ae7ff', b: '#ffe066' },
    { kind: 'glacier', name: 'Aurora Canyon', a: '#7dffd4', b: '#bfeaff' },
    { kind: 'lattice', name: 'Pylon Fields', a: '#ffb066', b: '#ff3b4d' },
    { kind: 'titangrove', name: 'Titan Grove', a: '#ff7a1a', b: '#ffd166' },
    { kind: 'forest', name: 'Neon Grove', a: '#7cff4d', b: '#2de2ff' },
    { kind: 'ruins', name: 'Machine Graveyard', a: '#ff5fd2', b: '#ff3b4d' },
    { kind: 'windfarm', name: 'Turbine Titans', a: '#e8f4ff', b: '#ff3b4d' },
    { kind: 'monoliths', name: 'Gravity Monoliths', a: '#ffd166', b: '#67ffe0' },
    { kind: 'arches', name: 'Hellgate', a: '#ff3b3b', b: '#ffb066' },
    { kind: 'ribcage', name: 'Leviathan Graveyard', a: '#e6e9f2', b: '#7dffb2' },
    { kind: 'floating', name: 'Sky Isles', a: '#67ffe0', b: '#ffc37a' },
    { kind: 'falls', name: 'Cascade Walls', a: '#9fd8ff', b: '#2de2ff' },
    { kind: 'mushroom', name: 'Spore Hollow', a: '#ff5fd2', b: '#7cff4d' },
    { kind: 'finale', name: 'The Terminus', a: '#e8f4ff', b: '#ffd166' },
];

export const SCENE_DISTANCE = 1800;

/** No loop: everything past the finale stays the finale's afterglow. */
export const sceneAt = (z: number): SceneSpec =>
    SCENES[
        Math.min(
            SCENES.length - 1,
            Math.floor(Math.abs(z) / SCENE_DISTANCE),
        )
    ];

export const sceneIndexAt = (z: number): number =>
    Math.min(SCENES.length - 1, Math.floor(Math.abs(z) / SCENE_DISTANCE));
