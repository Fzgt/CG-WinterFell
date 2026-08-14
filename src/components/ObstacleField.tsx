import { useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import ObstacleSection from './ObstacleSection';
import { SECTION_LENGTH, VISIBLE_SECTIONS } from '../config/obstacles';
import { benchFlags } from '../utils/bench';
import { paletteFor } from '../config/levels';
import { playCrash } from '../utils/audio';

/**
 * Obstacles: glowing pylons the player has to weave through.
 *
 * These used to be a carved-pumpkin GLB tinted through four hardcoded distance
 * colours. Generated geometry costs no download, takes its colour from the
 * level, and — being emissive — is what the bloom pass turns into light.
 */
export const OBSTACLE_SIZE = { width: 7, height: 13, depth: 7 };

const ObstacleField = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const setGameOver = useStore(state => state.setGameOver);
    const level = useStore(state => state.level);

    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);

    const meshData = useMemo(() => {
        const { width, height, depth } = OBSTACLE_SIZE;
        const geometry = new THREE.BoxGeometry(width, height, depth);
        // Origin at the base, so a pylon stands on the grid rather than
        // sinking half of itself into it.
        geometry.translate(0, height / 2, 0);
        const material = new THREE.MeshStandardMaterial({
            color: '#05040a',
            emissive: new THREE.Color(paletteFor(level).neon),
            emissiveIntensity: 1.15,
            roughness: 0.35,
            metalness: 0.1,
        });
        return { geometry, material };
    }, [level]);

    const checkCollision = (position: THREE.Vector3): boolean => {
        if (gameOver) return false;

        const [px, , pz] = playerPosition;
        const dx = position.x - px;
        const dz = position.z - pz;
        if (Math.sqrt(dx * dx + dz * dz) >= 5.2) return false;

        if (benchFlags.immortal) return false;
        setGameOver(true);
        playCrash();
        return true;
    };

    useFrame(() => {
        if (gameOver) return;

        const next = Math.floor(
            Math.abs(playerPosition[2]) / SECTION_LENGTH,
        );
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
