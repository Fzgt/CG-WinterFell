import { useRef } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { useBox } from '@react-three/cannon';
import * as THREE from 'three';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import PlayerCraft from './PlayerCraft';

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
            {/* No rotation: the craft is modelled nose-forward down -Z, unlike
                the cyclist that had to be spun to face away from the camera. */}
            <group ref={playerGroupRef} position={[0, 2.4, -20]} scale={1.15}>
                <PlayerCraft />
            </group>
        </>
    );
};

export default Player;
