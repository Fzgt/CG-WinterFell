import * as THREE from 'three';
import { useTexture, Stars } from '@react-three/drei'
import { useLayoutEffect } from 'react';


const Skybox = () => {
    const galaxyTexture = useTexture('/textures/galaxy.jpg')
    useLayoutEffect(() => {
        galaxyTexture.wrapS = galaxyTexture.wrapT = THREE.RepeatWrapping;
        galaxyTexture.repeat.set(2, 2);
    })

    return (
        <>
            <Stars factor={80} radius={280} saturation={0} count={10000} fade speed={3} />

            <mesh>
                <sphereGeometry args={[800, 32, 32]} />
                <meshPhongMaterial
                    emissive={0xff2190}
                    side={THREE.BackSide}
                    emissiveIntensity={0.1}
                    map={galaxyTexture}
                />
            </mesh>
        </>
    )
}


export default Skybox;