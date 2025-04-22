import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';

const BOO_COUNT_PER_SECTION = 150;
const FIELD_WIDTH = 1000;
const SECTION_LENGTH = 2000;
const TOTAL_SECTIONS = 4;
const TOTAL_BOOS = BOO_COUNT_PER_SECTION * TOTAL_SECTIONS;

const START_Z_POSITION = -8000;

const DISTANCE_COLORS = [
  { distance: 8000, color: new THREE.Color('#FFFFFF') },   // white
  { distance: 10000, color: new THREE.Color('#FFB3E6') },  // pink
  { distance: 12000, color: new THREE.Color('#80B3FF') },  // blue
  { distance: 14000, color: new THREE.Color('#9966CC') },  // purple
];

const randomInRange = (from: number, to: number) =>
  from + Math.random() * (to - from);

const KingBooField = () => {
  const { scene: booModel } = useGLTF('/models/obstacles/astral_cat.glb') as any;

  const playerPosition = useStore(state => state.playerPosition);
  const gameOver = useStore(state => state.gameOver);
  const setGameOver = useStore(state => state.setGameOver);
  const addPlayerSpeed = useStore(state => state.addPlayerSpeed);

  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D()).current;
  const booPositions = useRef<THREE.Vector3[]>([]);
  const currentColorIndex = useRef<number>(0);

  const [meshData, setMeshData] = useState<{
    geometry: THREE.BufferGeometry | null;
    material: THREE.MeshStandardMaterial | null;
  }>({ geometry: null, material: null });

  useEffect(() => {
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.MeshStandardMaterial | null = null;

    booModel.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        geometry = child.geometry;
        if (child.material instanceof THREE.MeshStandardMaterial) {
          material = child.material.clone();
          material.color.set(DISTANCE_COLORS[0].color);
          return;
        }
      }
    });

    if (geometry && material) {
      setMeshData({ geometry, material });
    }
  }, [booModel]);

  const generateAllBoos = () => {
    const positions: THREE.Vector3[] = [];

    for (let section = 0; section < TOTAL_SECTIONS; section++) {
      const sectionStartZ = START_Z_POSITION - section * SECTION_LENGTH;
      const sectionEndZ = sectionStartZ - SECTION_LENGTH;

      for (let i = 0; i < BOO_COUNT_PER_SECTION; i++) {
        const x = randomInRange(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
        const z = randomInRange(sectionStartZ, sectionEndZ);
        positions.push(new THREE.Vector3(x, 30, z));
      }
    }

    return positions;
  };

  useEffect(() => {
    if (!meshData.geometry || !meshData.material || !instancedMeshRef.current) return;

    const allPositions = generateAllBoos();
    booPositions.current = allPositions;

    booPositions.current.forEach((position, i) => {
      dummy.position.copy(position);
      dummy.scale.set(3, 3, 3);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();
      instancedMeshRef.current?.setMatrixAt(i, dummy.matrix);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [meshData.geometry, meshData.material, instancedMeshRef.current]);

  useFrame(() => {
    if (gameOver || !instancedMeshRef.current) return;

    const playerPos = new THREE.Vector3(...playerPosition);
    const totalDistance = Math.abs(playerPosition[2]);

    if (currentColorIndex.current < DISTANCE_COLORS.length - 1 &&
      totalDistance >= DISTANCE_COLORS[currentColorIndex.current + 1].distance) {
      currentColorIndex.current++;

      addPlayerSpeed();

      if (meshData.material) {
        meshData.material.color.set(DISTANCE_COLORS[currentColorIndex.current].color);
      }
    }

    const collisionRadius = 15;

    for (let i = 0; i < booPositions.current.length; i++) {
      const position = booPositions.current[i];

      const dx = position.x - playerPos.x;
      const dy = position.y - playerPos.y;
      const dz = position.z - playerPos.z;

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < collisionRadius) {
        setGameOver(true);
        break;
      }
    }
  });

  if (!meshData.geometry || !meshData.material) {
    return null;
  }

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[meshData.geometry, meshData.material, TOTAL_BOOS]}
      castShadow
      receiveShadow
    />
  );
};

export default KingBooField; 