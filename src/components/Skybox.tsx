import * as THREE from 'three';
import { useTexture, Stars } from '@react-three/drei'
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useStore } from '../store';

const Skybox = () => {

    const galaxyTexture = useTexture('/textures/galaxy.jpg')
    const skyboxRef = useRef<THREE.Group>(null);
    const shipPosition = useStore(state => state.shipPosition);

    useLayoutEffect(() => {
        galaxyTexture.wrapS = galaxyTexture.wrapT = THREE.RepeatWrapping;
        galaxyTexture.repeat.set(2, 2);
    })

    useEffect(() => {
        if (!skyboxRef.current) return;
        skyboxRef.current.position.set(...shipPosition);
    }, shipPosition)

    return (
        <group ref={skyboxRef}>
            <Stars factor={40} radius={280} saturation={0} count={9000} fade speed={2} />

            <mesh>
                <sphereGeometry args={[800, 32, 32]} />
                <meshPhongMaterial
                    emissive={0xff2190}
                    side={THREE.BackSide}
                    emissiveIntensity={0.1}
                    map={galaxyTexture}
                />
            </mesh>
        </group>
    )
}


export default Skybox;