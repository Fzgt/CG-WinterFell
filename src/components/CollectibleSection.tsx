import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { randomInRange2 } from '../utils/utils';
import { FIELD_WIDTH, SECTION_LENGTH } from '../config/pumpkin';
import { CollectibleConfig } from './CollectibleField';

// For tracking pumpkin positions to avoid collisions 
if (!window.pumpkinRegistry) {
    window.pumpkinRegistry = {};
}

declare global {
    interface Window {
        pumpkinRegistry: {
            [sectionIndex: number]: THREE.Vector3[];
        };
    }
}

interface CollectibleSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.MeshStandardMaterial;
    };
    playerPosition: [number, number, number];
    checkCollision: (position: THREE.Vector3) => boolean;
    config: CollectibleConfig;
    visible?: boolean;
}

const CollectibleSection = ({
    sectionIndex,
    meshData,
    checkCollision,
    config,
    visible = true,
}: CollectibleSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const [positions] = useState(() => {
        const pumpkinsInSection = window.pumpkinRegistry[sectionIndex] || [];
        
        return generateSectionCollectibles(sectionIndex, pumpkinsInSection, config.count);
    });
    const [collectedIndices, setCollectedIndices] = useState<Set<number>>(new Set());

    const { scene } = useThree();
    const timeRef = useRef(0);
    const frameCounter = useRef(0);

    function isTooCloseToAnyPumpkin(position: THREE.Vector3, pumpkins: THREE.Vector3[]): boolean {
        const MIN_DISTANCE_SQ = 25 * 25;
        for (const pumpkin of pumpkins) {
            const dx = position.x - pumpkin.x;
            const dz = position.z - pumpkin.z;
            const distSquared = dx * dx + dz * dz;
            if (distSquared < MIN_DISTANCE_SQ) return true;
        }
        return false;
    }

    // Generate random positions for collectibles in this section
    function generateSectionCollectibles(section: number, pumpkins: THREE.Vector3[], count: number) {
        const positions: THREE.Vector3[] = [];
        const sectionStartZ = section === 0 ? -250 : -section * SECTION_LENGTH;
        const sectionEndZ = sectionStartZ - SECTION_LENGTH;
        let attempts = 0;
        const maxAttempts = count * 5;

        while (positions.length < count && attempts < maxAttempts) {
            attempts++;
            
            const x = randomInRange2(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
            const z = randomInRange2(sectionStartZ, sectionEndZ);
            const pos = new THREE.Vector3(x, 5, z);
            
            if (!isTooCloseToAnyPumpkin(pos, pumpkins)) {
                positions.push(pos);
            }
        }
        
        return positions;
    }

    const createCollectionEffect = useCallback((position: THREE.Vector3) => {
        const particles = new THREE.Group();
        
        for (let i = 0; i < config.particleCount; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(config.particleRadius, 8, 8),
                new THREE.MeshBasicMaterial({ color: config.particleColor })
            );
            
            // Random offset from center
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 2;
            particle.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 2,
                position.z + Math.sin(angle) * radius
            );
            
            particles.add(particle);
        }
        
        scene.add(particles);
        
        // Remove after animation
        setTimeout(() => {
            scene.remove(particles);
            particles.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
        }, 500);
    }, [scene, config]);

    const updateInstanceMatrix = useCallback(() => {
        if (!instancedMeshRef.current) return;

        let visibleCount = 0;
        
        // Update time for continuous rotation
        timeRef.current += 0.01;

        positions.forEach((position, i) => {
            if (!collectedIndices.has(i)) {
                dummy.position.copy(position);
                dummy.position.y = position.y + Math.sin(timeRef.current + i * 0.5) * config.floatHeight;
                dummy.scale.set(config.scale, config.scale, config.scale);

                const baseRotation = config.rotation;
                dummy.rotation.set(
                    baseRotation[0],
                    baseRotation[1] + (baseRotation[0] === 0 ? timeRef.current * config.rotationSpeed + i * 0.1 : 0),
                    baseRotation[2]
                );

                dummy.updateMatrix();
                instancedMeshRef.current?.setMatrixAt(visibleCount++, dummy.matrix);
            }
        });

        instancedMeshRef.current.count = visibleCount;
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    }, [positions, collectedIndices, config]);

    // Initial setup
    useEffect(() => {
        updateInstanceMatrix();
    }, [meshData.geometry, meshData.material, updateInstanceMatrix]);

    // Check collisions and animate collectibles
    useFrame((_, delta) => {
        if (!visible || !instancedMeshRef.current) return;

        timeRef.current += delta;
        frameCounter.current++;

        let needsUpdate = false;
        const newCollected = new Set<number>();

        positions.forEach((position, index) => {
            if (!collectedIndices.has(index) && checkCollision(position)) {
                createCollectionEffect(position);
                newCollected.add(index);
                needsUpdate = true;
            }
        });

        if (newCollected.size > 0) {
            setCollectedIndices(prev => {
                const updated = new Set(prev);
                newCollected.forEach(i => updated.add(i));
                return updated;
            });
        }

        // Update matrix every 2 frames to reduce CPU load
        if (frameCounter.current % 5 === 0 || needsUpdate) {
            updateInstanceMatrix();
        }
    });

    if (!visible) return null;

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[meshData.geometry, meshData.material, config.count]}
            castShadow
            receiveShadow
        />
    );
};

export default CollectibleSection;
