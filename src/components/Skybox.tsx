import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useStore } from '../store';

const Skybox = () => {
    const { scene: skyboxScene } = useGLTF('/models/skybox/skybox.glb');
    const skyboxRef = useRef<THREE.Group>(null);
    const playerPosition = useStore(state => state.playerPosition);

    useLayoutEffect(() => {
        if (!skyboxRef.current) return;

        skyboxScene.scale.set(1, 1, 1).multiplyScalar(3.5);
        skyboxScene.position.set(0, 40, 110);
        skyboxScene.rotation.set(0, Math.PI / 2, 0);
        skyboxRef.current.add(skyboxScene);
    }, []);

    useEffect(() => {
        if (!skyboxRef.current) return;
        skyboxRef.current.position.set(...playerPosition);
    }, [playerPosition]);

    return (
        <group ref={skyboxRef}>
            <primitive object={skyboxScene} />
        </group>
    );
};

export default Skybox;