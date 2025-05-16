import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { randomInRange2 } from '../utils/utils';
import { FIELD_WIDTH, SECTION_LENGTH } from '../config/pumpkin';
import { CollectibleConfig } from './CollectibleField';

// Track pumpkin positions to avoid overlapping
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

const CANDY_COLORS = [
    0xffffff, 
    0xffff00, 
    0x800080, 
];

const CollectibleSection = ({
    sectionIndex,
    meshData,
    checkCollision,
    config,
    visible = true,
}: CollectibleSectionProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
    const glowMeshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useRef(new THREE.Object3D()).current;
    const glowDummy = useRef(new THREE.Object3D()).current;
    
    const [positions] = useState(() => {
        const pumpkinsInSection = window.pumpkinRegistry[sectionIndex] || [];
        return generateSectionCollectibles(sectionIndex, pumpkinsInSection, config.count);
    });
    
    const [collectedIndices, setCollectedIndices] = useState<Set<number>>(new Set());

    const [instanceColors] = useState(() => {
        if (config.modelPath.includes('mini_candy')) {
            return Array(config.count).fill(0).map(() => 
                CANDY_COLORS[Math.floor(Math.random() * CANDY_COLORS.length)]
            );
        }
        return [];
    });

     // Create glow material using the texture
    const glowTexture = useTexture('/textures/glow.png');
        const [glowMaterial] = useState(() => {
            glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
            
            return new THREE.MeshBasicMaterial({
                map: glowTexture,
                color: config.glowColor,
                opacity: config.glowOpacity,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
    });
    const [glowGeometry] = useState(() => new THREE.SphereGeometry(4, 16, 16));
    
    // Three.js particle effects
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

    function generateSectionCollectibles(section: number, pumpkins: THREE.Vector3[], count: number) {
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
        const maxAttempts = count * 8;
        
        while (positions.length < count && attempts < maxAttempts) {
            attempts++;
            
            const x = randomInRange2(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
            const z = randomInRange2(sectionStartZ, sectionEndZ);
            
            const y = config.floatHeight > 0 ? 5 + config.floatHeight : 1;
            const pos = new THREE.Vector3(x, y, z);
            
            if (!isTooCloseToAnyPumpkin(pos, pumpkins) && !isTooCloseToExistingCollectibles(pos, positions)) {
                positions.push(pos);
            }
        }
        
        console.log(`Section ${section}: Generated ${positions.length}/${count} collectibles (${config.modelPath})`);
        return positions;
    }
    
    // Track other collectibles' positions to avoid overlapping
    function isTooCloseToExistingCollectibles(position: THREE.Vector3, existingPositions: THREE.Vector3[]): boolean {
        const MIN_DISTANCE = 15;
        const MIN_DISTANCE_SQUARED = MIN_DISTANCE * MIN_DISTANCE;
        
        for (const existing of existingPositions) {
            const dx = position.x - existing.x;
            const dz = position.z - existing.z;
            const distSquared = dx * dx + dz * dz;
            
            if (distSquared < MIN_DISTANCE_SQUARED) {
                return true;
            }
        }
        return false;
    }
    
    // Particle effect for collection
    const createCollectionEffect = useCallback((position: THREE.Vector3) => {
        const particles = new THREE.Group();
        
        for (let i = 0; i < config.particleCount; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(config.particleRadius, 8, 8),
                new THREE.MeshBasicMaterial({ color: config.particleColor })
            );
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

    const timeRef = useRef(0);
    
    const updateInstanceMatrix = useCallback(() => {
        if (!instancedMeshRef.current || !glowMeshRef.current) return;

        let visibleCount = 0;
        
        positions.forEach((position, i) => {
            if (!collectedIndices.has(i)) {
                // Update main collectible
                dummy.position.copy(position);
                const floatHeight = config.floatHeight;
                const floatOffset = Math.sin(timeRef.current + i * 0.5) * floatHeight;
                dummy.position.y = position.y + floatOffset;
                dummy.scale.set(config.scale, config.scale, config.scale);
                
                // Apply base rotation from config, then add dynamic rotation
                const baseRotation = config.rotation;
                if (config.rotationSpeed !== 0) {
                    dummy.rotation.set(
                        baseRotation[0], 
                        baseRotation[1] + timeRef.current * config.rotationSpeed + i * 0.1, 
                        baseRotation[2]
                    );
                } else {
                    // Non rotating item - no variation
                    dummy.rotation.set(
                        baseRotation[0], 
                        baseRotation[1], 
                        baseRotation[2]
                    );
                }
                dummy.updateMatrix();
                instancedMeshRef.current?.setMatrixAt(visibleCount, dummy.matrix);

                // Update glow effect (billboard to face camera)
                glowDummy.position.copy(dummy.position);
                glowDummy.position.y += config.glowOffsetY;
                glowDummy.rotation.set(0, Math.PI/4, 0);
                const glowScale = config.glowSize || 1.5;
                glowDummy.scale.set(glowScale, glowScale, glowScale);

                glowDummy.updateMatrix();
                glowMeshRef.current?.setMatrixAt(visibleCount, glowDummy.matrix);

                if (config.modelPath.includes('mini_candy') && instanceColors.length > 0) {
                    const color = new THREE.Color(instanceColors[i]);
                    instancedMeshRef.current?.setColorAt(visibleCount, color);
                }
                
                visibleCount++;
            }
        });
        
        if (instancedMeshRef.current && glowMeshRef.current) {
            instancedMeshRef.current.count = visibleCount;
            instancedMeshRef.current.instanceMatrix.needsUpdate = true;
            glowMeshRef.current.count = visibleCount;
            glowMeshRef.current.instanceMatrix.needsUpdate = true;
            
            if (config.modelPath.includes('mini_candy')) {
                instancedMeshRef.current.instanceColor!.needsUpdate = true;
            }
        }
    }, [positions, collectedIndices, config, instanceColors]);

    // Initial setup
    useEffect(() => {
        updateInstanceMatrix();
    }, [meshData.geometry, meshData.material, updateInstanceMatrix]);

    // Check collisions and animate collectibles
    useFrame((state) => {
        if (!visible || !instancedMeshRef.current) return;

        // Use consistent time progression
        timeRef.current = state.clock.getElapsedTime();
        
        positions.forEach((position, index) => {
            if (!collectedIndices.has(index) && checkCollision(position)) {
                createCollectionEffect(position);
                setCollectedIndices(prev => {
                    const newSet = new Set(prev);
                    newSet.add(index);
                    return newSet;
                });
            }
        });
        updateInstanceMatrix();
    });

    if (!visible) return null;

    return (
        <group>
        {/* Render glow effect */}
            <instancedMesh
                ref={glowMeshRef}
                args={[glowGeometry, glowMaterial, config.count]}
                renderOrder={1}
            />
        {/* Main collectible (rendered on top) */}
            <instancedMesh
                ref={instancedMeshRef}
                args={[meshData.geometry, meshData.material, config.count]}
                castShadow
                receiveShadow
                renderOrder={2}
            />
        </group>
    );
};

export default CollectibleSection;