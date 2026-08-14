import * as THREE from 'three';

/**
 * Where each section's pumpkins ended up, so collectibles can be scattered
 * around them instead of inside them.
 *
 * A ObstacleSection publishes its layout when it mounts and drops it when it
 * unmounts, which keeps this the size of the handful of sections currently on
 * screen. It used to live on `window` and was only ever written to, so every
 * section the player passed left its 260 positions behind for the rest of the
 * session.
 *
 * Ordering note: a section's collectibles read this during their own first
 * render, so ObstacleField must stay ahead of CollectibleField in the scene
 * graph (see Game.tsx). A missing entry is not fatal — collectibles simply
 * scatter without avoiding anything.
 */
const sections = new Map<number, THREE.Vector3[]>();

export const publishSectionObstacles = (
    sectionIndex: number,
    positions: THREE.Vector3[],
) => {
    sections.set(sectionIndex, positions);
};

export const getSectionObstacles = (sectionIndex: number): THREE.Vector3[] =>
    sections.get(sectionIndex) ?? [];

export const releaseSectionObstacles = (sectionIndex: number) => {
    sections.delete(sectionIndex);
};

/** Number of sections currently held — used by the benchmark to prove this stays flat. */
export const registrySize = () => sections.size;
