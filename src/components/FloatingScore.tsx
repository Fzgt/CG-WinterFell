import { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/store';
import '../styles/score.css';

interface FloatingScoreProps {
  position: THREE.Vector3;
  value: number;
  onComplete: () => void;
}

const FloatingScore = ({ position, value, onComplete }: FloatingScoreProps) => {
  const [opacity, setOpacity] = useState(1);
  const [yOffset, setYOffset] = useState(0);
  const startTime = useRef(Date.now());
  const initialPlayerPosition = useRef(new THREE.Vector3());
  const playerPosition = useStore(state => state.playerPosition);
  const duration = 800;
  
  // Store the initial player position when this score is created
  useEffect(() => {
    initialPlayerPosition.current = new THREE.Vector3(...playerPosition);
  }, []);

  useEffect(() => {
    const animateScore = () => {
      const elapsed = Date.now() - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      
      setYOffset(progress * 10); // Move up
      setOpacity(1 - progress); // Fade out
      
      if (progress < 1) {
        requestAnimationFrame(animateScore);
      } else {
        onComplete();
      }
    };
    
    requestAnimationFrame(animateScore);
  }, [onComplete]);

  // Calculate the position offset from the initial player position
  const offsetX = position.x - initialPlayerPosition.current.x;
  const offsetZ = position.z - initialPlayerPosition.current.z;
  
  // Apply those offsets to current player position
  const currentPlayerPos = new THREE.Vector3(...playerPosition);
  const scorePosition = new THREE.Vector3(
    currentPlayerPos.x + offsetX,
    position.y + 2 + yOffset,
    currentPlayerPos.z + offsetZ
  );

  return (
    <Html
      position={[scorePosition.x, scorePosition.y, scorePosition.z]}
      center
      distanceFactor={20}
      sprite
      transform
      occlude={false}
    >
      <div
        className={`floating-score ${value < 0 ? 'negative' : ''}`}
        style={{
          opacity: opacity
        }}
      >
        {value > 0 ? '+' : ''}{value}
      </div>
    </Html>
  );
};

export default FloatingScore;