import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

const PUMPKIN_COUNT_PER_SECTION = 150;
const FIELD_WIDTH = 1000;
const SECTION_LENGTH = 2000;
const TOTAL_SECTIONS = 4;
const TOTAL_PUMPKINS = PUMPKIN_COUNT_PER_SECTION * TOTAL_SECTIONS;

const DISTANCE_COLORS = [
  { distance: 0, color: new THREE.Color('#FF8C00') }, //  橙色
  { distance: 2000, color: new THREE.Color('#32CD32') }, // 绿色 不动
  { distance: 4000, color: new THREE.Color('#888888') }, // 棕色 不动
  { distance: 6000, color: new THREE.Color('#222222') }, // 黑色 不动
];

const randomInRange = (from: number, to: number) =>
  from + Math.random() * (to - from);

const PumpkinField = () => {
  const { scene: pumpkinModel } = useGLTF('/models/obstacles/halloween_pumpkin_2.glb') as any;

  const playerPosition = useStore(state => state.playerPosition);
  const gameOver = useStore(state => state.gameOver);
  const setGameOver = useStore(state => state.setGameOver);
  const addPlayerSpeed = useStore(state => state.addPlayerSpeed);

  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D()).current;
  const pumpkinPositions = useRef<THREE.Vector3[]>([]);
  const currentColorIndex = useRef<number>(0);

  const [meshData, setMeshData] = useState<{
    geometry: THREE.BufferGeometry | null;
    material: THREE.MeshStandardMaterial | null;
  }>({ geometry: null, material: null });

  useEffect(() => {
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.MeshStandardMaterial | null = null;

    pumpkinModel.traverse((child: THREE.Object3D) => {
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
  }, [pumpkinModel]);

  const generateAllPumpkins = () => {
    const positions: THREE.Vector3[] = [];

    for (let section = 0; section < TOTAL_SECTIONS; section++) {
      const sectionStartZ = section === 0 ? -300 : -section * SECTION_LENGTH;
      const sectionEndZ = sectionStartZ - SECTION_LENGTH;

      for (let i = 0; i < PUMPKIN_COUNT_PER_SECTION; i++) {
        const x = randomInRange(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
        const z = randomInRange(sectionStartZ, sectionEndZ);
        positions.push(new THREE.Vector3(x, 1, z));
      }
    }

    return positions;
  };

  // init pumpkins
  useEffect(() => {
    if (!meshData.geometry || !meshData.material || !instancedMeshRef.current) return;

    const allPositions = generateAllPumpkins();
    pumpkinPositions.current = allPositions;

    pumpkinPositions.current.forEach((position, i) => {
      dummy.position.copy(position);
      dummy.scale.set(0.1, 0.1, 0.1);
      dummy.updateMatrix();
      instancedMeshRef.current?.setMatrixAt(i, dummy.matrix);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [meshData.geometry, meshData.material, instancedMeshRef.current]);

  useFrame(() => {
    if (gameOver || !instancedMeshRef.current) return;

    const playerPos = new THREE.Vector3(...playerPosition);
    const totalDistance = Math.abs(playerPosition[2]);

    // check if need to update color
    if (currentColorIndex.current < DISTANCE_COLORS.length - 1 &&
      totalDistance >= DISTANCE_COLORS[currentColorIndex.current + 1].distance) {
      currentColorIndex.current++;

      addPlayerSpeed();

      if (meshData.material) {
        meshData.material.color.set(DISTANCE_COLORS[currentColorIndex.current].color);
      }
    }

    const collisionRadius = 15;

    for (let i = 0; i < pumpkinPositions.current.length; i++) {
      const position = pumpkinPositions.current[i];

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

  // if model not ready, return null
  if (!meshData.geometry || !meshData.material) {
    return null;
  }

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[meshData.geometry, meshData.material, TOTAL_PUMPKINS]}
      castShadow
      receiveShadow
    />
  );
};

export default PumpkinField; 