import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { leftBound, rightBound } from '../constants';
import useKeyboardControls from './useKeyboardControls';
import { useStore } from '../store';
import { MotionController } from '../utils/MotionController';
import * as THREE from 'three';

export interface PlayerRefs {
  physicsRef: React.RefObject<THREE.Object3D>;
  playerGroupRef: React.RefObject<THREE.Group>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
}

export const usePlayerMovement = ({ physicsRef, playerGroupRef, cameraRef }: PlayerRefs) => {
  const gameOver = useStore(state => state.gameOver);
  const playerSpeed = useStore(state => state.playerSpeed);
  const setPlayerPosition = useStore(state => state.setPlayerPosition);
  const { left, right } = useKeyboardControls();

  const xPosition = useRef(new MotionController(0, 0.2));
  const zPosition = useRef(new MotionController(-20, 0.15));
  const rotationZ = useRef(new MotionController(0, 0.2));

  useFrame((_, delta) => {
    if (gameOver) return;
    if (!physicsRef.current || !playerGroupRef.current) return;

    const moveSpeed = playerSpeed * 60 * delta;
    const forwardSpeed = playerSpeed * delta * 60;

    if (left) {
      rotationZ.current.setTarget(-Math.PI / 6);
      xPosition.current.setTarget(Math.max(xPosition.current.getValue() - moveSpeed, leftBound));
    } else if (right) {
      rotationZ.current.setTarget(Math.PI / 6);
      xPosition.current.setTarget(Math.min(xPosition.current.getValue() + moveSpeed, rightBound));
    } else {
      rotationZ.current.setTarget(0);
    }

    zPosition.current.setTarget(zPosition.current.getValue() - forwardSpeed);

    const newX = xPosition.current.update();
    const newZ = zPosition.current.update();
    const newRotZ = rotationZ.current.update();

    physicsRef.current.position.set(newX, 2, newZ);
    playerGroupRef.current.rotation.z = newRotZ;
    playerGroupRef.current.position.set(newX, 1.5, newZ);

    setPlayerPosition([newX, 2, newZ]);

    if (cameraRef.current) {
      cameraRef.current.position.set(newX, 6, newZ + 12);
      cameraRef.current.lookAt(newX, 2, newZ);
    }
  });
}; 