import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import PumpkinSection from './PumkinSection';
import {
    DISTANCE_COLORS,
    SECTION_LENGTH,
    TOTAL_SECTIONS,
    VISIBLE_SECTIONS,
} from '../config/pumpkin';

const PumpkinField = () => {
    const { scene: pumpkinModel } = useGLTF('/models/obstacles/halloween_pumpkin_2.glb');

    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const setGameOver = useStore(state => state.setGameOver);
    const addPlayerSpeed = useStore(state => state.addPlayerSpeed);

    const currentColorIndex = useRef<number>(0);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);

    const [meshData, setMeshData] = useState<{
        geometry: THREE.BufferGeometry | null;
        material: THREE.MeshStandardMaterial | null;
    }>({ geometry: null, material: null });

    const checkCollision = (position: THREE.Vector3): boolean => {
        if (gameOver) return false;

        const playerPos = new THREE.Vector3(...playerPosition);
        const collisionRadius = 15;

        const dx = position.x - playerPos.x;
        const dy = position.y - playerPos.y;
        const dz = position.z - playerPos.z;

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < collisionRadius) {
            setGameOver(true);
            return true;
        }

        return false;
    };

    useEffect(() => {
        let geometry: THREE.BufferGeometry | null = null;
        let material: THREE.MeshStandardMaterial | null = null;

        pumpkinModel.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
                geometry = child.geometry;
                if (child.material instanceof THREE.MeshStandardMaterial) {
                    material = child.material.clone();
                    material.color.set(DISTANCE_COLORS[0].color);
                    return;
                }
            }
        });

        if (geometry && material) {
            setMeshData({ geometry, material });
        }
    }, [pumpkinModel]);

    useFrame(() => {
        if (gameOver || !meshData.material) return;

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

        if (
            currentColorIndex.current < DISTANCE_COLORS.length - 1 &&
            totalDistance >= DISTANCE_COLORS[currentColorIndex.current + 1].distance
        ) {
            currentColorIndex.current++;
            addPlayerSpeed();

            meshData.material.color.set(DISTANCE_COLORS[currentColorIndex.current].color);
        }
    });

    const renderSections = useMemo(() => {
        if (!meshData.geometry || !meshData.material) return null;

        return visibleSections.map(sectionIndex => (
            <PumpkinSection
                key={`section-${sectionIndex}`}
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

export default PumpkinField;
