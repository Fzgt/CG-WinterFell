import { useTexture } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";
import * as THREE from 'three';
import { useFrame } from "@react-three/fiber";
import { planeSize, planeTextureSize } from "../constants";
import { useStore } from "../store";

/**
 * @CoreLogic
 * Two ground meshes (ground1Ref & ground2Ref) are created
 * In each frame, compare the ship's Z position with each ground mesh's Z position
 * If the ship has moved far enough past one ground that mesh is moved forward infront of the ship to create a infinite groundeffect
*/

const Ground = () => {
    // Load tile texture for ground
    // const texture = useTexture('/textures/maple.jpg');
    const texture = useTexture('/textures/floor.jpg');

    // Get current ship position from Zustand store
    const shipPosition = useStore(state => state.playerPosition);

    // References to the two ground planes
    const ground1Ref = useRef<THREE.Mesh>(null);
    const ground2Ref = useRef<THREE.Mesh>(null);

    // Distance to move the ground planes each time
    const MOVE_DISTANCE = planeSize;

    // Configure texture wrapping and repetition
    useLayoutEffect(() => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(planeTextureSize, planeTextureSize);
        texture.anisotropy = 16;
    }, [texture]);

    // Animation frame loop for infinite scrolling logic
    useFrame(() => {
        const [, , shipZ] = shipPosition; // Get ship's Z position

        if (ground1Ref.current && ground2Ref.current) {
            const g1Z = ground1Ref.current.position.z;
            const g2Z = ground2Ref.current.position.z;

            // If ship has passed behind ground1, move it forward behind ground2
            if (shipZ < g1Z - MOVE_DISTANCE) {
                ground1Ref.current.position.z = g2Z - MOVE_DISTANCE;
            }

            // If ship has passed behind ground2, move it forward behind ground1
            if (shipZ < g2Z - MOVE_DISTANCE) {
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
                    emissive={0xffffff}
                    roughness={0}
                    metalness={0}
                    emissiveMap={texture}
                    map={texture}
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
                    emissive={0xffffff}
                    roughness={0}
                    metalness={0}
                    emissiveMap={texture}
                    map={texture}
                />
            </mesh>
        </>
    );
};

export default Ground;
