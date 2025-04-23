import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { leftBound, rightBound } from '../config/constants';
import useKeyboardControls from './useKeyboardControls';
import { useStore } from '../store/store';
import { MotionController } from '../utils/MotionController';
import * as THREE from 'three';

export interface PlayerRefs {
  physicsRef: React.RefObject<THREE.Object3D>;
  playerGroupRef: React.RefObject<THREE.Group>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
}

export const usePlayerMovement = ({ physicsRef, playerGroupRef, cameraRef }: PlayerRefs) => {
  const gameOver = useStore(state => state.gameOver);
  const gamePaused = useStore(state => state.gamePaused);
  const togglePause = useStore(state => state.togglePause);
  const playerSpeed = useStore(state => state.playerSpeed);
  const setPlayerPosition = useStore(state => state.setPlayerPosition);
  const { left, right } = useKeyboardControls();

  const FIXED_LATERAL_SPEED = 5;

  const xPosition = useRef(new MotionController(0, 0.2));
  const zPosition = useRef(new MotionController(-20, 0.15));
  const rotationZ = useRef(new MotionController(0, 0.2));

  const spacePressed = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !spacePressed.current) {
        spacePressed.current = true;
        togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spacePressed.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [togglePause]);

  useFrame((_, delta) => {
    if (gameOver || gamePaused) return;
    if (!physicsRef.current || !playerGroupRef.current) return;

    const lateralMoveSpeed = FIXED_LATERAL_SPEED * 60 * delta;
    const forwardSpeed = playerSpeed * delta * 60;

    if (left) {
      rotationZ.current.setTarget(-Math.PI / 9);
      xPosition.current.setTarget(Math.max(xPosition.current.getValue() - lateralMoveSpeed, leftBound));
    } else if (right) {
      rotationZ.current.setTarget(Math.PI / 9);
      xPosition.current.setTarget(Math.min(xPosition.current.getValue() + lateralMoveSpeed, rightBound));
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
    console.log('Player Position:', Math.abs(Math.round(newZ)));

    if (cameraRef.current) {
      cameraRef.current.position.set(newX, 6, newZ + 12);
      cameraRef.current.lookAt(newX, 2, newZ);
    }
  });
}; 