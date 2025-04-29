import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { Instances, Instance } from '@react-three/drei';
import { planeSize,grassCount } from '../config/constants';
import { randomInRange2 } from '../utils/utils';

// Section component for grass patches
interface GrassSectionProps {
  sectionIndex: number;
  meshData: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
  };
  visible: boolean;
}

const GrassSection: React.FC<GrassSectionProps> = ({ sectionIndex, meshData, visible }) => {
  const sectionRef = useRef<THREE.Group>(null);
  
  // Generate consistent grass positions for this section using total random positioning
  const grassInstances = useMemo(() => {
    const sectionZ = -sectionIndex * planeSize;
    const sectionStartZ = sectionZ - planeSize;
    const sectionEndZ = sectionZ;
    const instances = [];

    for (let i = 0; i < grassCount; i++) {
      // random positioning within section bounds
      const x = randomInRange2(-planeSize / 3, planeSize / 3);
      const z = randomInRange2(sectionStartZ, sectionEndZ);
      
      // Random scale variation
      const scale = randomInRange2(1.6, 2.2);

      instances.push({
        position: [x, -13, z] as [number, number, number],
        rotation: [Math.PI, 0, 0] as [number, number, number],
        scale: [scale, scale, scale] as [number, number, number],
      });
    }

    return instances;
  }, [sectionIndex]);

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

// Main GrassField component with performance optimizations
const GrassField: React.FC = () => {
  const grassGLTF = useGLTF('/models/terrain/grass.glb');
  const playerPosition = useStore(state => state.playerPosition);
  
  // Performance optimization: Use refs to avoid unnecessary re-renders
  const currentSectionIndexRef = useRef(0);
  const [visibleSections, setVisibleSections] = useState<number[]>([0, 1, 2]);
  
  // Performance optimization: Reduced visible sections for better performance
  const VISIBLE_SECTIONS = 2;

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

  // Performance optimization: Skip update if section hasn't changed
  const lastUpdateTime = useRef(0);
  
  // Update visible sections based on player position
  useFrame((state) => {
    // Performance optimization: Throttle updates to reduce CPU usage
    if (state.clock.getElapsedTime() - lastUpdateTime.current < 0.2) return;
    
    const totalDistance = Math.abs(playerPosition[2]);
    const newSectionIndex = Math.floor(totalDistance / planeSize);

    if (newSectionIndex > currentSectionIndexRef.current) {
      currentSectionIndexRef.current = newSectionIndex;
      lastUpdateTime.current = state.clock.getElapsedTime();

      // Performance optimization: Only calculate visible sections when needed
      const newVisibleSections = [];
      for (let i = 0; i < VISIBLE_SECTIONS; i++) {
        const sectionIndex = newSectionIndex + i;
        newVisibleSections.push(sectionIndex);
      }
      setVisibleSections(newVisibleSections);
    }
  });

  // Performance optimization: Memoize sections rendering
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
        visible={true}
      />
    ));
  }, [meshData, visibleSections]);

  if (!meshData.geometry || !meshData.material) return null;

  return <>{renderSections}</>;
};

export default GrassField;