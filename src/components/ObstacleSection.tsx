import { useRef, useState, useEffect, useLayoutEffect } from 'react';
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

    // Layout effect, not a passive one: an InstancedMesh starts with an
    // all-zero matrix buffer, and r3f's render loop runs on its own rAF, so a
    // passive effect could land after a frame had already been drawn from the
    // zeroed matrices.
    useLayoutEffect(() => {
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
            // Never frustum-culled. An InstancedMesh computes its bounding
            // sphere from the instance matrices the first time it is tested
            // and caches it; if that test races ahead of the effect that
            // writes the matrices, the sphere is computed from the zeroed
            // buffer as a single point at the world origin — and the whole
            // section is culled the moment the camera flies past the origin.
            // That is exactly the reported symptom: obstacles flash while the
            // origin is still in view, then vanish for good. Whether the race
            // is lost depends on frame timing, which is why WebGL captures
            // kept showing them while Chrome sessions did not. Every other
            // instanced mesh here (rails, trail) already opts out of culling;
            // the three visible sections are always near the camera anyway,
            // so culling them bought nothing.
            frustumCulled={false}
        />
    );
};

export default ObstacleSection;
