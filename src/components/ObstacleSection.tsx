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
import { trackCurve, trackHeight } from '../config/constants';
import { useStore } from '../store/store';

interface ObstacleSectionProps {
    sectionIndex: number;
    meshData: {
        bodyGeometry: THREE.BufferGeometry;
        frameGeometry: THREE.BufferGeometry;
        bodyMaterial: THREE.MeshStandardMaterial;
        frameMaterial: THREE.MeshBasicMaterial;
    };
    checkCollision: (obstacle: Obstacle) => boolean;
    visible?: boolean;
}

const ObstacleSection = ({
    sectionIndex,
    meshData,
    checkCollision,
    visible = true,
}: ObstacleSectionProps) => {
    const bodyRef = useRef<THREE.InstancedMesh>(null);
    const frameRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    // Where the craft sits the moment this section is built, read once. It
    // used to arrive as a prop, which meant the field had to hold a live
    // subscription to the player's position just to pass it down.
    const [obstacles] = useState(() => {
        const generated = generateSectionObstacles(
            sectionIndex,
            useStore.getState().playerPosition[0],
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
    // zeroed matrices. Body and frame share the same matrices.
    useLayoutEffect(() => {
        const body = bodyRef.current;
        const frame = frameRef.current;
        if (!body || !frame) return;

        obstacles.forEach((obstacle, i) => {
            dummy.position.copy(obstacle.position);
            // The winding and the hills are applied here, at render, so
            // collision logic and the fairness sweep keep working in straight
            // flat logical space.
            dummy.position.x += trackCurve(obstacle.position.z);
            dummy.position.y += trackHeight(obstacle.position.z);
            dummy.scale.copy(obstacle.scale);
            dummy.rotation.set(0, obstacle.rotationY, 0);
            dummy.updateMatrix();
            body.setMatrixAt(i, dummy.matrix);
            frame.setMatrixAt(i, dummy.matrix);
        });

        body.instanceMatrix.needsUpdate = true;
        frame.instanceMatrix.needsUpdate = true;
    }, [obstacles, dummy]);

    useFrame(() => {
        if (!visible) return;

        for (const obstacle of obstacles) {
            if (checkCollision(obstacle)) break;
        }
    });

    // A section past the obstacle cutoff generates nothing, and an
    // InstancedMesh of nothing is not free: it still builds an instance
    // matrix buffer, of zero bytes, and the device refuses it — taking the
    // frame, and every frame after, with it. The first such section is 17
    // (it starts at -34000, past OBSTACLES_END_Z), and the field holds three
    // sections ahead, so it mounts the moment the craft passes 30000.
    if (!visible || obstacles.length === 0) return null;

    // Naive baseline for benchmarking (?instancing=off): one mesh per
    // obstacle, i.e. one draw call each. Only used to measure what instancing
    // buys, so the body alone is enough.
    if (!benchFlags.instancing) {
        return (
            <group>
                {obstacles.map((obstacle, i) => (
                    <mesh
                        key={i}
                        geometry={meshData.bodyGeometry}
                        material={meshData.bodyMaterial}
                        position={[
                            obstacle.position.x +
                                trackCurve(obstacle.position.z),
                            obstacle.position.y +
                                trackHeight(obstacle.position.z),
                            obstacle.position.z,
                        ]}
                        scale={obstacle.scale}
                        rotation={[0, obstacle.rotationY, 0]}
                    />
                ))}
            </group>
        );
    }

    // Never frustum-culled. An InstancedMesh computes its bounding sphere
    // from the instance matrices the first time it is tested and caches it;
    // if that test races ahead of the effect that writes the matrices, the
    // sphere is a single point at the world origin and the whole section is
    // culled the moment the camera flies past — obstacles flash, then vanish
    // for good. The three live sections are always near the camera anyway.
    return (
        <>
            <instancedMesh
                ref={bodyRef}
                args={[meshData.bodyGeometry, meshData.bodyMaterial, obstacles.length]}
                frustumCulled={false}
            />
            <instancedMesh
                ref={frameRef}
                args={[meshData.frameGeometry, meshData.frameMaterial, obstacles.length]}
                frustumCulled={false}
            />
        </>
    );
};

export default ObstacleSection;
