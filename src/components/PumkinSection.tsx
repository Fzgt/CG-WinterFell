import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { generateSectionPumpkins } from '../utils/generatePumpkins';
import { benchFlags } from '../utils/bench';
import { publishSectionPumpkins, releaseSectionPumpkins } from '../utils/pumpkinRegistry';
interface PumpkinSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.MeshStandardMaterial;
    };
    playerPosition: [number, number, number];
    checkCollision: (position: THREE.Vector3) => boolean;
    visible?: boolean;
}

const PumpkinSection = ({
    sectionIndex,
    meshData,
    playerPosition,
    checkCollision,
    visible = true,
}: PumpkinSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const [positions] = useState(() => {
        const pumpkins = generateSectionPumpkins(sectionIndex, playerPosition[0]);
        publishSectionPumpkins(sectionIndex, pumpkins);
        return pumpkins;
    });

    // Drop this section's layout once it scrolls out of view, so the registry
    // only ever holds the sections currently on screen.
    useEffect(
        () => () => releaseSectionPumpkins(sectionIndex),
        [sectionIndex],
    );
    

    useEffect(() => {
        if (!instancedMeshRef.current || !meshData.geometry || !meshData.material) return;

        positions.forEach((position, i) => {
            dummy.position.copy(position);
            dummy.scale.set(0.1, 0.1, 0.1);
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
                        scale={[0.1, 0.1, 0.1]}
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

export default PumpkinSection;
