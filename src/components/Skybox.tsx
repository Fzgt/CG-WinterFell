import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

const STAR_COUNT = 600;

/**
 * The sky: a dark dome tinted by the level, with a field of stars.
 *
 * It used to be a photograph of maple leaves stretched over a sphere and lit
 * hot pink, which fought with everything else on screen. A flat dark dome lets
 * the grid and the obstacles be the only bright things, which is the whole
 * point of a neon look.
 */
const Skybox = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const groupRef = useRef<THREE.Group>(null);

    const fogColor = useMemo(
        () => new THREE.Color(paletteFor(level).fog),
        [level],
    );
    const neonColor = useMemo(
        () => new THREE.Color(paletteFor(level).neon),
        [level],
    );

    const stars = useMemo(() => {
        const positions = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            // Spherical, but biased upwards: stars below the horizon are never
            // seen and would only cost fill.
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 0.9 + 0.05);
            const r = 700;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
        );
        return geometry;
    }, []);

    // The dome travels with the player so it never falls behind.
    useFrame(() => {
        groupRef.current?.position.set(...playerPosition);
    });

    return (
        <group ref={groupRef}>
            <mesh>
                <sphereGeometry args={[800, 24, 16]} />
                <meshBasicMaterial
                    color={fogColor}
                    side={THREE.BackSide}
                    fog={false}
                />
            </mesh>

            <points geometry={stars}>
                <pointsMaterial
                    color={neonColor}
                    size={2.4}
                    sizeAttenuation={false}
                    transparent
                    opacity={0.75}
                    fog={false}
                />
            </points>
        </group>
    );
};

export default Skybox;
