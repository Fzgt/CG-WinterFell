import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The player: a glowing dart with a pulsing engine.
 *
 * It used to be a downloaded cartoon cyclist, which in a world made of light
 * was the one object still belonging to a different game. Built from
 * primitives, coloured by the level.
 *
 * The wake is a separate component (CraftTrail) rendered at the scene root,
 * because it has to be laid down in world space — parented here it would move
 * with the craft and never trail anything.
 */
const PlayerCraft = () => {
    const level = useStore(state => state.level);
    const playerSpeed = useStore(state => state.playerSpeed);
    const gameOver = useStore(state => state.gameOver);
    const palette = paletteFor(level);

    const engineRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.PointLight>(null);
    const clock = useRef(0);

    // A four-sided cone laid on its side: a clean faceted dart whose faces
    // catch the light differently, which a flat triangle fan would not.
    const hull = useMemo(() => {
        const geometry = new THREE.ConeGeometry(1.9, 6.4, 4);
        geometry.rotateX(-Math.PI / 2);
        geometry.scale(1, 0.42, 1);
        return geometry;
    }, []);

    useFrame((_, delta) => {
        clock.current += Math.min(delta, 1 / 20);
        const beat = Math.sin(clock.current * (8 + playerSpeed * 0.4));

        // The engine flickers faster the quicker the run gets, which is the
        // only on-screen cue that speed has stepped up between levels.
        if (engineRef.current) {
            const pulse = 1 + beat * 0.22;
            engineRef.current.scale.set(pulse, pulse, 1 + pulse * 0.9);
        }
        if (glowRef.current) {
            glowRef.current.intensity = gameOver ? 0 : 9 + beat * 3;
        }
    });

    return (
        <group>
            <mesh geometry={hull}>
                <meshStandardMaterial
                    color="#12122a"
                    emissive={palette.neon}
                    emissiveIntensity={0.55}
                    roughness={0.25}
                    metalness={0.45}
                    flatShading
                />
            </mesh>

            {/* Engine flare. Small on purpose: bloom does the rest, and at any
                real size it swallows the hull it is supposed to sit behind. */}
            <mesh ref={engineRef} position={[0, 0, 3.1]}>
                <sphereGeometry args={[0.42, 10, 8]} />
                <meshBasicMaterial color={palette.accent} />
            </mesh>
            <pointLight
                ref={glowRef}
                position={[0, 0.4, 3.4]}
                color={palette.accent}
                distance={60}
            />
        </group>
    );
};

export default PlayerCraft;
