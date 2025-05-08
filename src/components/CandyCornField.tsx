// CandyCornField.tsx
import { useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import CandyCornSection from './CandyCornSection';
import { SECTION_LENGTH, VISIBLE_SECTIONS, TOTAL_SECTIONS } from '../config/pumpkin';

const CandyCornField = () => {
    const { scene: candyCornModel } = useGLTF('/models/collectibles/candy_corn.glb');

    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const addScore = useStore(state => state.addScore);

    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);

    const [meshData, setMeshData] = useState<{
        geometry: THREE.BufferGeometry | null;
        material: THREE.MeshStandardMaterial | null;
    }>({ geometry: null, material: null });

    // Check collision with candy corns
    const checkCollision = (position: THREE.Vector3): boolean => {
        if (gameOver) return false;

        const playerPos = new THREE.Vector3(...playerPosition);
        const collisionRadius = 8; // Smaller than pumpkin collision radius

        const dx = position.x - playerPos.x;
        const dy = position.y - playerPos.y;
        const dz = position.z - playerPos.z;

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < collisionRadius) {
            // Instead of game over, add 10 points
            addScore(10);
            return true; // Return true to indicate collision (for removal)
        }

        return false;
    };

    // Extract geometry and material from the candy corn model
    useEffect(() => {
        let geometry: THREE.BufferGeometry | null = null;
        let material: THREE.MeshStandardMaterial | null = null;

        candyCornModel.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
                geometry = child.geometry;
                if (child.material instanceof THREE.MeshStandardMaterial) {
                    material = child.material.clone();
                    return;
                }
            }
        });

        if (geometry && material) {
            setMeshData({ geometry, material });
        }
    }, [candyCornModel]);

    // Update visible sections based on player position
    useFrame(() => {
        if (gameOver) return;

        const totalDistance = Math.abs(playerPosition[2]);
        const newSectionIndex = Math.floor(totalDistance / SECTION_LENGTH);

        if (newSectionIndex > currentSectionIndex) {
            setCurrentSectionIndex(newSectionIndex);

            const newVisibleSections = [];
            for (let i = 0; i < VISIBLE_SECTIONS; i++) {
                const sectionIndex = newSectionIndex + i;
                if (sectionIndex < TOTAL_SECTIONS) {
                    newVisibleSections.push(sectionIndex);
                }
            }
            setVisibleSections(newVisibleSections);
        }
    });

    const renderSections = useMemo(() => {
        if (!meshData.geometry || !meshData.material) return null;

        return visibleSections.map(sectionIndex => (
            <CandyCornSection
                key={`candy-section-${sectionIndex}`}
                sectionIndex={sectionIndex}
                meshData={{
                    geometry: meshData.geometry as THREE.BufferGeometry,
                    material: meshData.material as THREE.MeshStandardMaterial,
                }}
                playerPosition={playerPosition}
                checkCollision={checkCollision}
                visible={true}
            />
        ));
    }, [meshData, visibleSections, playerPosition]);

    if (!meshData.geometry || !meshData.material) return null;

    return <>{renderSections}</>;
};

export default CandyCornField;