import { useRef } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { useBox } from '@react-three/cannon';
import * as THREE from 'three';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import PlayerCraft from './PlayerCraft';
import KartCraft from './KartCraft';
import { craftChoice } from '../utils/bench';

const Player = () => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const playerGroupRef = useRef<THREE.Group>(null);
    const [physicsRef] = useBox(() => ({
        mass: 0,
        args: [5, 3, 5],
        position: [0, 2, -20],
    }));

    usePlayerMovement({ physicsRef, playerGroupRef, cameraRef });

    return (
        <>
            <PerspectiveCamera
                ref={cameraRef}
                makeDefault
                fov={68}
                near={0.1}
                far={1200}
                position={[0, 11, 20]}
            />
            <group ref={physicsRef} />
            {/* No rotation: both models are built nose-forward down -Z, unlike
                the cyclist that had to be spun to face away from the camera.
                The kart rides lower, because it is meant to be on the grid
                rather than over it. */}
            <group
                ref={playerGroupRef}
                position={[0, 2.4, -20]}
                scale={craftChoice === 'kart' ? 1.3 : 1.15}
            >
                {craftChoice === 'kart' ? <KartCraft /> : <PlayerCraft />}
            </group>
        </>
    );
};

export default Player;
