import { useTexture } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { planeSize, planeTextureSize } from '../config/constants';
import { useStore } from '../store/store';

const Ground = () => {
    // const texture = useTexture('/textures/floor.jpg');
    const textures = useTexture({
        map: '/textures/rock_floor/rock_albedo.png',
        normalMap: '/textures/rock_floor/rock_normal.png',
        roughnessMap: '/textures/rock_floor/rock_roughness.png',
        aoMap: '/textures/rock_floor/rock_ao.png',
        displacementMap: '/textures/rock_floor/rock_height.png'
    });

    const playerPosition = useStore(state => state.playerPosition);
    const ground1Ref = useRef<THREE.Mesh>(null);
    const ground2Ref = useRef<THREE.Mesh>(null);
    const MOVE_DISTANCE = planeSize;
    
    useLayoutEffect(() => {
        Object.values(textures).forEach(texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(planeTextureSize, planeTextureSize);
        texture.anisotropy = 16;
        });
    }, [textures]);

    useFrame(() => {
        const [, , playerZ] = playerPosition;

        if (ground1Ref.current && ground2Ref.current) {
            const g1Z = ground1Ref.current.position.z;
            const g2Z = ground2Ref.current.position.z;

            if (playerZ < g1Z - MOVE_DISTANCE) {
                ground1Ref.current.position.z = g2Z - MOVE_DISTANCE;
            }

            if (playerZ < g2Z - MOVE_DISTANCE) {
                ground2Ref.current.position.z = g1Z - MOVE_DISTANCE;
            }
        }
    });

    return (
        <>
            <mesh
                ref={ground1Ref}
                position={[0, 0, -planeSize / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
            >
                <planeGeometry args={[planeSize, planeSize]} />
                <meshStandardMaterial
                    {...textures}
                    displacementScale={0.8}
                    metalness={0.1} 
                    roughness={1}
                    aoMapIntensity={1}
                />
            </mesh>

            <mesh
                ref={ground2Ref}
                position={[0, 0, -planeSize - planeSize / 2]}
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
            >
                <planeGeometry args={[planeSize, planeSize]} />
                <meshStandardMaterial
                    {...textures}
                    displacementScale={0.8}
                    metalness={0.1} 
                    roughness={1}
                    aoMapIntensity={1}
                />
            </mesh>
        </>
    );
};

export default Ground;
