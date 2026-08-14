import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { generateSectionObstacles } from '../utils/generateObstacles';
import { benchFlags } from '../utils/bench';
import { publishSectionObstacles, releaseSectionObstacles } from '../utils/obstacleRegistry';
interface ObstacleSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.MeshStandardMaterial;
    };
    playerPosition: [number, number, number];
    checkCollision: (position: THREE.Vector3) => boolean;
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
    const [positions] = useState(() => {
        const pumpkins = generateSectionObstacles(sectionIndex, playerPosition[0]);
        publishSectionObstacles(sectionIndex, pumpkins);
        return pumpkins;
    });

    // Drop this section's layout once it scrolls out of view, so the registry
    // only ever holds the sections currently on screen.
    useEffect(
        () => () => releaseSectionObstacles(sectionIndex),
        [sectionIndex],
    );
    

    useEffect(() => {
        if (!instancedMeshRef.current || !meshData.geometry || !meshData.material) return;

        positions.forEach((position, i) => {
            dummy.position.copy(position);
            dummy.updateMatrix();
            instancedMeshRef.current?.setMatrixAt(i, dummy.matrix);
        });

        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    }, [meshData.geometry, meshData.material]);

    useFrame(() => {
        if (!visible || !instancedMeshRef.current) return;

        for (const position of positions) {
            if (checkCollision(position)) {
                break;
            }
        }
    });

    if (!visible) return null;

    // Naive baseline for benchmarking (?instancing=off): one mesh per pumpkin,
    // i.e. one draw call each, instead of a single InstancedMesh for the
    // whole section. Only used to measure what instancing buys.
    if (!benchFlags.instancing) {
        return (
            <group>
                {positions.map((position, i) => (
                    <mesh
                        key={i}
                        geometry={meshData.geometry}
                        material={meshData.material}
                        position={position}
                        castShadow
                        receiveShadow
                    />
                ))}
            </group>
        );
    }

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[meshData.geometry, meshData.material, positions.length]}
            castShadow
            receiveShadow
        />
    );
};

export default ObstacleSection;
