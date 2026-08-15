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

    /**
     * An extruded ship outline rather than a cone. The cone read as a plain
     * pyramid from behind — the only angle the player ever sees it from —
     * with no silhouette to speak of. This is drawn as a 2D profile with a
     * pointed nose, swept wings and a notched tail, then given thickness, so
     * the shape survives being viewed head-on.
     */
    const hull = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, -3.6); // nose
        shape.lineTo(0.9, -0.6);
        shape.lineTo(2.9, 1.9); // starboard wingtip
        shape.lineTo(2.1, 2.6);
        shape.lineTo(0.85, 2.1);
        shape.lineTo(0.7, 3.0); // tail notch
        shape.lineTo(-0.7, 3.0);
        shape.lineTo(-0.85, 2.1);
        shape.lineTo(-2.1, 2.6);
        shape.lineTo(-2.9, 1.9); // port wingtip
        shape.lineTo(-0.9, -0.6);
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.75,
            bevelEnabled: true,
            bevelThickness: 0.28,
            bevelSize: 0.22,
            bevelSegments: 1,
        });
        // Lay the profile flat and point the nose down -Z.
        geometry.rotateX(-Math.PI / 2);
        geometry.center();
        return geometry;
    }, []);

    // A bright outline over the dark body: the shape stays legible against a
    // dark track, and the edges are what bloom picks up.
    const outline = useMemo(() => new THREE.EdgesGeometry(hull, 25), [hull]);

    // Same reasoning as the obstacles: readable from lit colour alone, with
    // emissive as an addition rather than the only thing holding it up.
    const hullColor = useMemo(
        () => new THREE.Color(palette.neon).multiplyScalar(0.32),
        [palette.neon],
    );

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
                    color={hullColor}
                    emissive={palette.neon}
                    emissiveIntensity={0.35}
                    roughness={0.3}
                    metalness={0.5}
                    flatShading
                />
            </mesh>
            <lineSegments geometry={outline}>
                <lineBasicMaterial color={palette.neon} toneMapped={false} />
            </lineSegments>

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
