import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { randomInRange2 } from '../utils/utils';
import { PUMPKIN_COUNT_PER_SECTION, FIELD_WIDTH, SECTION_LENGTH } from '../config/pumpkin';

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
    checkCollision,
    visible = true,
}: PumpkinSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const [positions] = useState(() => generateSectionPumpkins(sectionIndex));

    function generateSectionPumpkins(section: number) {
        const positions: THREE.Vector3[] = [];
        console.log(section);

        let sectionStartZ, sectionEndZ;

        if (section === 0) {
            sectionStartZ = -250;
            sectionEndZ = -SECTION_LENGTH;
        } else {
            sectionStartZ = -section * SECTION_LENGTH;
            sectionEndZ = sectionStartZ - SECTION_LENGTH;
        }

        for (let i = 0; i < PUMPKIN_COUNT_PER_SECTION; i++) {
            const x = randomInRange2(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
            const z = randomInRange2(sectionStartZ, sectionEndZ);
            positions.push(new THREE.Vector3(x, 1, z));
        }
        return positions;
    }

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

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[meshData.geometry, meshData.material, PUMPKIN_COUNT_PER_SECTION]}
            castShadow
            receiveShadow
        />
    );
};

export default PumpkinSection;
