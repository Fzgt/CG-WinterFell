import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { randomInRange2 } from '../utils/utils';
import { FIELD_WIDTH, SECTION_LENGTH } from '../config/pumpkin';

const CANDY_CORN_COUNT_PER_SECTION = 100;

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

interface CandyCornSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.MeshStandardMaterial;
    };
    playerPosition: [number, number, number];
    checkCollision: (position: THREE.Vector3) => boolean;
    visible?: boolean;
}

const CandyCornSection = ({
    sectionIndex,
    meshData,
    checkCollision,
    visible = true,
}: CandyCornSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const [positions] = useState(() => {
        const pumpkinsInSection = window.pumpkinRegistry[sectionIndex] || [];
        
        return generateSectionCandyCorns(sectionIndex, pumpkinsInSection);
    });
    const [collectedIndices, setCollectedIndices] = useState<Set<number>>(new Set());
    
    // Get Three.js scene for particle effects
    const { scene } = useThree();

    function isTooCloseToAnyPumpkin(position: THREE.Vector3, pumpkins: THREE.Vector3[]): boolean {
        const MIN_DISTANCE = 25;
        const MIN_DISTANCE_SQUARED = MIN_DISTANCE * MIN_DISTANCE;
        
        for (const pumpkin of pumpkins) {
            const dx = position.x - pumpkin.x;
            const dz = position.z - pumpkin.z;
            const distSquared = dx * dx + dz * dz;
            
            if (distSquared < MIN_DISTANCE_SQUARED) {
                return true;
            }
        }
        return false;
    }

    // Generate random positions for candy corns in this section
    function generateSectionCandyCorns(section: number, pumpkins: THREE.Vector3[]) {
        const positions: THREE.Vector3[] = [];

        let sectionStartZ, sectionEndZ;

        if (section === 0) {
            sectionStartZ = -250;
            sectionEndZ = -SECTION_LENGTH;
        } else {
            sectionStartZ = -section * SECTION_LENGTH;
            sectionEndZ = sectionStartZ - SECTION_LENGTH;
        }

        let attempts = 0;
        const maxAttempts = CANDY_CORN_COUNT_PER_SECTION * 5;
        
        while (positions.length < CANDY_CORN_COUNT_PER_SECTION && attempts < maxAttempts) {
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
    
    // Create particle effect for collection
    const createCollectionEffect = useCallback((position: THREE.Vector3) => {
        // Create a simple particle system for collection effect
        const particles = new THREE.Group();
        
        for (let i = 0; i < 8; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xffff00 })
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
    }, [scene]);

    // Update instance matrix
    const updateInstanceMatrix = useCallback(() => {
        if (!instancedMeshRef.current) return;

        // Reset counter for compacting the instances array
        let visibleCount = 0;

        positions.forEach((position, i) => {
            if (!collectedIndices.has(i)) {
                // Set position, add some rotation and floating animation
                dummy.position.copy(position);
                // Make candy corns smaller than pumpkins
                dummy.scale.set(3, 3, 3);
                // Add a slight rotation for visual interest
                dummy.rotation.set(0, Date.now() * 0.001 + i, 0);
                dummy.updateMatrix();
                instancedMeshRef.current?.setMatrixAt(visibleCount++, dummy.matrix);
            }
        });

        // Update the instance count to match visible items
        if (instancedMeshRef.current) {
            instancedMeshRef.current.count = visibleCount;
            instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [positions, collectedIndices]);

    // Initial setup
    useEffect(() => {
        updateInstanceMatrix();
    }, [meshData.geometry, meshData.material, updateInstanceMatrix]);

    // Check collisions and animate candy corns
    useFrame(() => {
        if (!visible || !instancedMeshRef.current) return;

        let newCollisions = false;
        
        positions.forEach((position, index) => {
            if (!collectedIndices.has(index) && checkCollision(position)) {
                // Create visual effect
                createCollectionEffect(position);
                
                // Mark as collected
                setCollectedIndices(prev => {
                    const newSet = new Set(prev);
                    newSet.add(index);
                    return newSet;
                });
                
                newCollisions = true;
            }
        });

        // Only update matrices if there are new collisions or for animation
        if (newCollisions || true) { // Always update for animation
            updateInstanceMatrix();
        }
    });

    if (!visible) return null;

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[meshData.geometry, meshData.material, CANDY_CORN_COUNT_PER_SECTION]}
            castShadow
            receiveShadow
        />
    );
};

export default CandyCornSection;