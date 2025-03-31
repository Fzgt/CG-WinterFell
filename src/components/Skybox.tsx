import * as THREE from 'three';
import { useGLTF} from '@react-three/drei';
import { useLayoutEffect, useRef, useEffect } from 'react';
import { useStore } from '../store';

const Skybox = () => {
    // Load GLB skybox model
    const { scene: skyboxScene } = useGLTF('/models/skybox/skybox.glb');
    const skyboxRef = useRef<THREE.Group>(null);  // Typed as THREE.Group
    const shipPosition = useStore(state => state.shipPosition);

    useLayoutEffect(() => {

        if (!skyboxRef.current) return;

        // Ensure skybox is visible
        skyboxScene.scale.set(1, 1, 1).multiplyScalar(3.5); // Large enough
        // skyboxScene.position.set(0, 20, 110);
        skyboxScene.position.set(0, 30, -360); 
        // Rotate the skybox (in radians)
        skyboxScene.rotation.set(
            0,              // X-axis rotation (tilt up/down)
            Math.PI / 2,    // Y-axis rotation (left/right pan) 
            0               // Z-axis rotation (rarely needed)
        );

        /*
        no rotate:
        skyboxScene.position.set(240, 35, -130); 
        */
        
        // Attach to ref
        skyboxRef.current.add(skyboxScene);
    }, []);

    useEffect(() => {
        if (!skyboxRef.current) return;
        skyboxRef.current.position.set(...shipPosition);
    }, [shipPosition]);

    return (
        <group ref={skyboxRef}>
            <primitive object={skyboxScene} />
        </group>
    );
};

export default Skybox;