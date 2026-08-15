import { useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useStore } from '../store/store';
import ObstacleSection from './ObstacleSection';
import { SECTION_LENGTH, VISIBLE_SECTIONS } from '../config/obstacles';
import { benchFlags } from '../utils/bench';
import { paletteFor } from '../config/levels';
import { playCrash } from '../utils/audio';
import { beatPulse } from '../utils/music';
import type { Obstacle } from '../utils/generateObstacles';

/**
 * Obstacles: dark monoliths with glowing edges, the player weaves through.
 *
 * A solid emissive box reads as a flat sticker at any distance — nothing on
 * it changes as you approach. Splitting each block into a near-black body and
 * a bright frame around its edges gives the bloom pass a line to bite instead
 * of a slab, and the silhouette stays readable however the level tints it.
 * Both parts are instanced, sharing one set of matrices, so a whole section
 * is still two draw calls.
 */
/** Unit block; each instance scales it into its own silhouette. */
export const OBSTACLE_SIZE = { width: 7, height: 13, depth: 7 };
/** Edge beam thickness, in the same local units as OBSTACLE_SIZE. */
const EDGE = 0.55;

/** The 12 edges of the unit block, merged into one geometry. */
const buildFrame = () => {
    const { width: w, height: h, depth: d } = OBSTACLE_SIZE;
    const hw = w / 2;
    const hd = d / 2;
    const parts: THREE.BufferGeometry[] = [];

    const beam = (
        sx: number, sy: number, sz: number,
        x: number, y: number, z: number,
    ) => {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        g.translate(x, y, z);
        parts.push(g);
    };

    for (const x of [-hw, hw]) {
        for (const z of [-hd, hd]) beam(EDGE, h, EDGE, x, h / 2, z); // uprights
    }
    for (const y of [0, h]) {
        for (const z of [-hd, hd]) beam(w, EDGE, EDGE, 0, y, z); // x beams
        for (const x of [-hw, hw]) beam(EDGE, EDGE, d, x, y, 0); // z beams
    }

    return mergeGeometries(parts);
};

const ObstacleField = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const setGameOver = useStore(state => state.setGameOver);
    const level = useStore(state => state.level);

    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);

    // Built once for the life of the field. Rebuilding these per level once
    // changed the instancedMesh args, and tearing one section down disposed
    // the shared pair out from under the other two — the level only mutates
    // colours now.
    const meshData = useMemo(() => {
        const { width, height, depth } = OBSTACLE_SIZE;
        const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
        // Origin at the base, so a block stands on the grid rather than
        // sinking half of itself into it. The frame is built in the same
        // space.
        bodyGeometry.translate(0, height / 2, 0);
        const frameGeometry = buildFrame();

        const bodyMaterial = new THREE.MeshStandardMaterial({
            roughness: 0.45,
            metalness: 0.2,
        });
        // Basic and un-tonemapped: the frame is the thing that should bloom.
        const frameMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });

        return { bodyGeometry, frameGeometry, bodyMaterial, frameMaterial };
    }, []);

    const baseNeon = useMemo(
        () => new THREE.Color(paletteFor(level).neon),
        [level],
    );

    useEffect(() => {
        // Body: a dark read of the level colour, visible on its own without
        // leaning on emissive.
        meshData.bodyMaterial.color.copy(baseNeon).multiplyScalar(0.13);
    }, [baseNeon, meshData]);

    const checkCollision = (obstacle: Obstacle): boolean => {
        if (gameOver) return false;

        const [px, , pz] = playerPosition;
        const dx = obstacle.position.x - px;
        const dz = obstacle.position.z - pz;
        // Each obstacle carries its own footprint, so a wide slab is genuinely
        // harder to slip past than a thin spire.
        if (Math.sqrt(dx * dx + dz * dz) >= obstacle.radius) return false;

        if (benchFlags.immortal) return false;
        setGameOver(true);
        playCrash();
        return true;
    };

    useFrame(() => {
        // The frames flash on the kick — the danger keeps the beat.
        meshData.frameMaterial.color
            .copy(baseNeon)
            .multiplyScalar(0.8 + 0.45 * beatPulse());

        if (gameOver) return;

        const next = Math.floor(Math.abs(playerPosition[2]) / SECTION_LENGTH);
        if (next > currentSectionIndex) {
            setCurrentSectionIndex(next);
            // Endless: sections are generated from their index, so there is no
            // reason to stop at a fixed count.
            setVisibleSections(
                Array.from({ length: VISIBLE_SECTIONS }, (_, i) => next + i),
            );
        }
    });

    return (
        <>
            {visibleSections.map(sectionIndex => (
                <ObstacleSection
                    key={`section-${sectionIndex}`}
                    sectionIndex={sectionIndex}
                    meshData={meshData}
                    playerPosition={playerPosition}
                    checkCollision={checkCollision}
                />
            ))}
        </>
    );
};

export default ObstacleField;
