import { useRef, useEffect } from 'react';
import { useAnimations, useGLTF, PerspectiveCamera } from '@react-three/drei';
import { useBox } from '@react-three/cannon';
import * as THREE from 'three';
import { usePlayerMovement } from '../hooks/usePlayerMovement';

const Player = () => {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const { scene, animations } = useGLTF('/models/player/scene.gltf');
    const playerGroupRef = useRef<THREE.Group>(null);
    const [physicsRef] = useBox(() => ({
        mass: 0,
        args: [7, 7, 7],
        position: [0, 2, -20],
    }));

    const { actions, names } = useAnimations(animations, playerGroupRef);

    useEffect(() => {
        if (names.length > 0) {
            actions[names[0]]?.play();
        }
    }, [actions, names]);

    usePlayerMovement({ physicsRef, playerGroupRef, cameraRef });

    return (
        <>
            <PerspectiveCamera
                ref={cameraRef}
                makeDefault
                fov={90}
                near={0.1}
                far={1200}
                position={[0, 6, -10]}
            />
            <group ref={physicsRef} />
            <group
                ref={playerGroupRef}
                position={[0, 1.5, -20]}
                rotation={[0, Math.PI, 0]}
                scale={2.5}
            >
                <primitive object={scene} />
            </group>
        </>
    );
};

export default Player;
