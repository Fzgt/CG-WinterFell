import { useState, useEffect } from 'react';
import * as THREE from 'three';
import FloatingScore from './FloatingScore';
import { useStore } from '../store/store';

// Type for each floating score instance
interface ScoreInstance {
  id: number;
  position: THREE.Vector3;
  value: number;
}

const FloatingScoreManager = () => {
  const [scoreInstances, setScoreInstances] = useState<ScoreInstance[]>([]);
  const scoreEvents = useStore(state => state.scoreEvents);
  const clearScoreEvent = useStore(state => state.clearScoreEvent);

  // Check for new score events
  useEffect(() => {
    if (scoreEvents && scoreEvents.length > 0) {
      const newEvent = scoreEvents[0];
      const eventPosition = new THREE.Vector3(...newEvent.position);
      
      setScoreInstances(prev => [
        ...prev,
        {
          id: Date.now(),
          position: eventPosition,
          value: newEvent.points
        }
      ]);
      clearScoreEvent(newEvent.id);
    }
  }, [scoreEvents, clearScoreEvent]);

  // Remove a floating score when its animation completes
  const handleScoreComplete = (id: number) => {
    setScoreInstances(prev => prev.filter(instance => instance.id !== id));
  };

  return (
    <>
      {scoreInstances.map(instance => (
        <FloatingScore
          key={instance.id}
          position={instance.position}
          value={instance.value}
          onComplete={() => handleScoreComplete(instance.id)}
        />
      ))}
    </>
  );
};

export default FloatingScoreManager;