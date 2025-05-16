import { useState, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import CollectibleSection from './CollectibleSection';
import { SECTION_LENGTH, VISIBLE_SECTIONS, TOTAL_SECTIONS } from '../config/pumpkin';

export interface CollectibleConfig {
  modelPath: string;
  scale: number;
  count: number;
  scoreValue: number;
  collisionRadius: number;
  particleColor: string | number;
  particleCount: number;
  particleRadius: number;
  particleSpeed: number;
  rotationSpeed: number;
  rotation: [number, number, number];
  floatHeight: number;
  glowColor: string | number;
  glowSize: number; 
  glowOpacity: number;
  glowOffsetY: number;
}

interface CollectibleFieldProps {
  config: CollectibleConfig;
}

const CollectibleField = ({ config }: CollectibleFieldProps) => {
    const { scene: collectibleModel } = useGLTF(config.modelPath);

    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const addScore = useStore(state => state.addScore);
    const reduceScore = useStore(state => state.reduceScore);
    const addScoreEvent = useStore(state => state.addScoreEvent);
    const reduceScoreEvent = useStore(state => state.reduceScoreEvent);
    const frameCounter = useRef(0);

    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);

    const [meshData, setMeshData] = useState<{
        geometry: THREE.BufferGeometry | null;
        material: THREE.MeshStandardMaterial | null;
    }>({ geometry: null, material: null });

    // Check collision with collectibles
    const checkCollision = (position: THREE.Vector3): boolean => {
        if (gameOver) return false;

        const playerPos = new THREE.Vector3(...playerPosition);
        const collisionRadius = config.collisionRadius;

        const dx = position.x - playerPos.x;
        const dy = position.y - playerPos.y;
        const dz = position.z - playerPos.z;

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < collisionRadius) {
            if (config.modelPath.includes('ghost') || config.modelPath.includes('bottle')) {
                reduceScore(config.scoreValue);
                reduceScoreEvent([position.x, position.y, position.z], -config.scoreValue);
            } else {
                addScore(config.scoreValue);
                addScoreEvent([position.x, position.y, position.z], config.scoreValue);
            }
            return true;
        }

        return false;
    };

    // Extract geometry and material from the collectible model
    useEffect(() => {
        let geometry: THREE.BufferGeometry | null = null;
        let material: THREE.MeshStandardMaterial | null = null;

        collectibleModel.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
                geometry = child.geometry;
                if (child.material instanceof THREE.MeshStandardMaterial) {
                    material = child.material.clone();
                    if (config.modelPath.includes('ghost')) {
                        material.color = new THREE.Color('pink');
                    }
                    return;
                }
            }
        });

        if (geometry && material) {
            setMeshData({ geometry, material });
        }
    }, [collectibleModel]);

    // Update visible sections based on player position
    useFrame(() => {
        if (gameOver) return;
    
        frameCounter.current++;
        if (frameCounter.current % 5 !== 0) return; // Throttle to every 5 frames
    
        const totalDistance = Math.abs(playerPosition[2]);
        const newSectionIndex = Math.floor(totalDistance / SECTION_LENGTH);
    
        if (newSectionIndex > currentSectionIndex) {
          setCurrentSectionIndex(newSectionIndex);
    
          const newVisibleSections: number[] = [];
          for (let i = 0; i < VISIBLE_SECTIONS; i++) {
            const sectionIndex = newSectionIndex + i;
            if (sectionIndex < TOTAL_SECTIONS) {
              newVisibleSections.push(sectionIndex);
            }
          }
          setVisibleSections(newVisibleSections);
        }
      });

    const renderSections = useMemo(() => {
        if (!meshData.geometry || !meshData.material) return null;

        return visibleSections.map(sectionIndex => (
            <CollectibleSection
                key={`collectible-section-${config.modelPath}-${sectionIndex}`}
                sectionIndex={sectionIndex}
                meshData={{
                    geometry: meshData.geometry as THREE.BufferGeometry,
                    material: meshData.material as THREE.MeshStandardMaterial,
                }}
                playerPosition={playerPosition}
                checkCollision={checkCollision}
                config={config}
                visible={true}
            />
        ));
    }, [meshData, visibleSections, playerPosition, config]);

    if (!meshData.geometry || !meshData.material) return null;

    return <>{renderSections}</>;
};

// Preload functionality
CollectibleField.preload = (modelPath: string) => {
    useGLTF.preload(modelPath);
};

export default CollectibleField;
