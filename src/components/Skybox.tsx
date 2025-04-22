import * as THREE from 'three';
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useStore } from '../store/store';
import { useTexture } from '@react-three/drei'

const Skybox = () => {

    const skyboxTexture = useTexture("/textures/maple.jpg");
    const skyboxRef = useRef<THREE.Group>(null);
    const playerPosition = useStore((state) => state.playerPosition);

    useLayoutEffect(() => {
        skyboxTexture.wrapS = skyboxTexture.wrapT = THREE.MirroredRepeatWrapping;
        skyboxTexture.repeat.set(2, 2);
    });

    useEffect(() => {
        if (!skyboxRef.current) return;
        skyboxRef.current.position.set(...playerPosition)
    }, [playerPosition])

    return (
        <group ref={skyboxRef}>
            <mesh>
                <sphereGeometry args={[800, 32, 32]} />
                <meshPhongMaterial
                    emissive={0xff2190}
                    side={THREE.BackSide}
                    emissiveIntensity={0.1}
                    map={skyboxTexture}
                />
            </mesh>
        </group>
    );
};

export default Skybox;