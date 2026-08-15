import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
    generateSectionObstacles,
    Obstacle,
} from '../utils/generateObstacles';
import { benchFlags } from '../utils/bench';
import {
    publishSectionObstacles,
    releaseSectionObstacles,
} from '../utils/obstacleRegistry';

interface ObstacleSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.MeshStandardMaterial;
    };
    playerPosition: [number, number, number];
    checkCollision: (obstacle: Obstacle) => boolean;
    visible?: boolean;
}

const ObstacleSection = ({
    sectionIndex,
    meshData,
    playerPosition,
    checkCollision,
    visible = true,
}: ObstacleSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const [obstacles] = useState(() => {
        const generated = generateSectionObstacles(
            sectionIndex,
            playerPosition[0],
        );
        publishSectionObstacles(sectionIndex, generated);
        return generated;
    });

    // Drop this section's layout once it scrolls out of view, so the registry
    // only ever holds the sections currently on screen.
    useEffect(
        () => () => releaseSectionObstacles(sectionIndex),
        [sectionIndex],
    );

    useEffect(() => {
        const mesh = instancedMeshRef.current;
        if (!mesh || !meshData.geometry || !meshData.material) return;

        obstacles.forEach((obstacle, i) => {
            dummy.position.copy(obstacle.position);
            dummy.scale.copy(obstacle.scale);
            dummy.rotation.set(0, obstacle.rotationY, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
    }, [meshData.geometry, meshData.material, obstacles, dummy]);

    useFrame(() => {
        if (!visible || !instancedMeshRef.current) return;

        for (const obstacle of obstacles) {
            if (checkCollision(obstacle)) break;
        }
    });

    if (!visible) return null;

    // Naive baseline for benchmarking (?instancing=off): one mesh per
    // obstacle, i.e. one draw call each. Only used to measure what instancing
    // buys.
    if (!benchFlags.instancing) {
        return (
            <group>
                {obstacles.map((obstacle, i) => (
                    <mesh
                        key={i}
                        geometry={meshData.geometry}
                        material={meshData.material}
                        position={obstacle.position}
                        scale={obstacle.scale}
                        rotation={[0, obstacle.rotationY, 0]}
                    />
                ))}
            </group>
        );
    }

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[meshData.geometry, meshData.material, obstacles.length]}
        />
    );
};

export default ObstacleSection;
