import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { Instances, Instance } from '@react-three/drei';
import { planeSize } from '../config/constants';

// Section component for grass patches
interface GrassSectionProps {
    sectionIndex: number;
    meshData: {
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
    };
    playerPosition: [number, number, number];
    visible: boolean;
}

const GrassSection: React.FC<GrassSectionProps> = ({ sectionIndex, meshData, visible }) => {
    const sectionRef = useRef<THREE.Group>(null);
    const grassCount = 400; // Adjust for performance

    // Generate consistent grass positions for this section
    const grassInstances = useMemo(() => {
        const sectionZ = -sectionIndex * planeSize;
        const instances = [];

        // Calculate how many rows/columns we need based on grassCount
        const rows = Math.ceil(Math.sqrt(grassCount));
        const cols = Math.ceil(grassCount / rows);

        // Calculate spacing between grass instances
        const spacingX = planeSize / (cols + 1);
        const spacingZ = planeSize / (rows + 1);

        // Create a seeded random generator for slight variations
        const seed = sectionIndex * 1000;
        const seededRandom = (n: number) => {
            return (((seed + n) * 9301 + 49297) % 233280) / 233280;
        };

        for (let i = 0; i < grassCount; i++) {
            // Grid-based positioning
            const row = Math.floor(i / cols);
            const col = i % cols;

            // Base position on grid
            const baseX = (col + 1) * spacingX - planeSize / 2;
            const baseZ = sectionZ - (row + 1) * spacingZ;

            // Add slight random offsets (10% of spacing)
            const randomOffsetX = (seededRandom(i) - 0.5) * spacingX * 0.2;
            const randomOffsetZ = (seededRandom(i + grassCount) - 0.5) * spacingZ * 0.2;

            const x = baseX + randomOffsetX;
            const z = baseZ + randomOffsetZ;

            // Random variations
            const scale = 1.6 + seededRandom(i + grassCount * 2) * 0.6; // 1.5-2.0 scale

            instances.push({
                position: [x, -12, z] as [number, number, number],
                rotation: [Math.PI, 0, 0] as [number, number, number],
                scale: [scale, scale, scale] as [number, number, number],
            });
        }

        return instances;
    }, [sectionIndex, grassCount, planeSize]);

    if (!visible) return null;

    return (
        <group ref={sectionRef}>
            <Instances limit={grassCount} geometry={meshData.geometry} material={meshData.material}>
                {grassInstances.map((props, i) => (
                    <Instance key={`grass-${sectionIndex}-${i}`} {...props} />
                ))}
            </Instances>
        </group>
    );
};

// Main GrassField component
const GrassField: React.FC = () => {
    const grassGLTF = useGLTF('/models/terrain/grass.glb');

    const playerPosition = useStore(state => state.playerPosition);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);
    const VISIBLE_SECTIONS = 2; // Number of sections visible at once

    const [meshData, setMeshData] = useState<{
        geometry: THREE.BufferGeometry | null;
        material: THREE.Material | null;
    }>({ geometry: null, material: null });

    // Extract geometry and material from the grass model
    useEffect(() => {
        if (!grassGLTF) return;

        let geometry: THREE.BufferGeometry | null = null;
        let material: THREE.Material | null = null;

        grassGLTF.scene.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
                geometry = child.geometry;

                if (child.material) {
                    // Clone and configure the material
                    if (child.material instanceof THREE.MeshStandardMaterial) {
                        const mat = child.material.clone() as THREE.MeshStandardMaterial;
                        mat.alphaToCoverage = true;
                        mat.transparent = true;
                        mat.side = THREE.DoubleSide;

                        // Check if emissiveMap exists
                        if (mat.emissiveMap) {
                            mat.map = mat.emissiveMap;
                            mat.emissive = new THREE.Color(0.5, 0.5, 0.5);
                        }

                        material = mat;
                    } else {
                        material = child.material;
                    }
                }
            }
        });

        if (geometry && material) {
            setMeshData({ geometry, material });
        }
    }, [grassGLTF]);

    // Update visible sections based on player position
    useFrame(() => {
        const totalDistance = Math.abs(playerPosition[2]);
        const newSectionIndex = Math.floor(totalDistance / planeSize);

        if (newSectionIndex > currentSectionIndex) {
            setCurrentSectionIndex(newSectionIndex);

            const newVisibleSections = [];
            for (let i = 0; i < VISIBLE_SECTIONS; i++) {
                const sectionIndex = newSectionIndex + i;
                newVisibleSections.push(sectionIndex);
            }
            setVisibleSections(newVisibleSections);
        }
    });

    // Render grass sections
    const renderSections = useMemo(() => {
        if (!meshData.geometry || !meshData.material) return null;

        return visibleSections.map(sectionIndex => (
            <GrassSection
                key={`grass-section-${sectionIndex}`}
                sectionIndex={sectionIndex}
                meshData={{
                    geometry: meshData.geometry as THREE.BufferGeometry,
                    material: meshData.material as THREE.Material,
                }}
                playerPosition={playerPosition}
                visible={true}
            />
        ));
    }, [meshData, visibleSections, playerPosition]);

    if (!meshData.geometry || !meshData.material) return null;

    return <>{renderSections}</>;
};

export default GrassField;
