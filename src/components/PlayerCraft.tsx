import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The player: an interceptor with a deep fuselage, thin swept wings, canards,
 * canted tail fins, a glass canopy and twin engines that pulse with the speed
 * of the run.
 *
 * It used to be a downloaded cartoon cyclist, which in a world made of light
 * was the one object still belonging to a different game. Everything here is
 * generated geometry, coloured by the level.
 *
 * It is built from several thin pieces rather than one extrusion. A single
 * profile can only have one thickness, and the thickness a fuselage needs
 * turns the wings into planks — from behind, the only angle the player ever
 * sees, the craft was two bricks with a point between them. Separate parts
 * cost four more draw calls on one object and buy a silhouette.
 *
 * Every part is built once and never rebuilt: the level changes colours only,
 * so nothing in this file allocates a buffer after the first frame.
 *
 * All profiles are drawn nose-toward -y, tail toward +y, and extruded along
 * +z; the two rotations below turn that into nose-toward -z (down the track)
 * with the extrusion standing up in +y. The assembly group then lifts and
 * centres the whole thing on the craft's origin.
 */
const flatten = (shape: THREE.Shape, depth: number, bevel: number) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel * 0.8,
        bevelSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI);
    return geometry;
};

const poly = (points: [number, number][]) => {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const p of points.slice(1)) shape.lineTo(...p);
    shape.closePath();
    return shape;
};

const PlayerCraft = () => {
    const level = useStore(state => state.level);
    const playerSpeed = useStore(state => state.playerSpeed);
    const gameOver = useStore(state => state.gameOver);
    const palette = paletteFor(level);

    const engineRef = useRef<THREE.Group>(null);
    const glowRef = useRef<THREE.PointLight>(null);
    const clock = useRef(0);

    /** Deep, waisted body: nose, shoulders, and two tail booms with the
     *  exhaust notch between them. */
    const fuselage = useMemo(
        () =>
            flatten(
                poly([
                    [0, -4.6], // nose
                    [0.42, -2.4],
                    [0.38, -1.2], // waist
                    [0.62, 0.6],
                    [0.95, 3.2], // starboard tail boom
                    [0.34, 2.6], // exhaust notch
                    [-0.34, 2.6],
                    [-0.95, 3.2],
                    [-0.62, 0.6],
                    [-0.38, -1.2],
                    [-0.42, -2.4],
                ]),
                0.7,
                0.2,
            ),
        [],
    );

    /** One thin plate carrying both wings, kinked leading edge, tips raked
     *  forward. Thin enough that the wing reads as a blade edge-on. */
    const wings = useMemo(
        () =>
            flatten(
                poly([
                    [0.45, -0.5],
                    [1.05, 0], // shoulder: leading edge starts here
                    [3.5, 2.0], // starboard tip, forward corner
                    [2.95, 2.8], // tip, trailing corner
                    [1.0, 2.15],
                    [-1.0, 2.15],
                    [-2.95, 2.8],
                    [-3.5, 2.0],
                    [-1.05, 0],
                    [-0.45, -0.5],
                ]),
                0.22,
                0.06,
            ),
        [],
    );

    /** Dorsal blade from behind the canopy to the tail: what gives the
     *  silhouette a top instead of leaving it flat. */
    const spine = useMemo(
        () =>
            flatten(
                poly([
                    [0, -1.6],
                    [0.5, 0.4],
                    [0.42, 2.4],
                    [-0.42, 2.4],
                    [-0.5, 0.4],
                ]),
                0.5,
                0.12,
            ),
        [],
    );

    /** Foreplane, one per side — the cheapest way to say "built to turn". */
    const canard = useMemo(
        () =>
            flatten(
                poly([
                    [0, 0],
                    [1.45, 0.7],
                    [1.3, 1.1],
                    [0, 0.62],
                ]),
                0.14,
                0,
            ),
        [],
    );

    /**
     * Canted tail fin. Drawn as a side profile and turned to stand upright,
     * so the same helper cannot be used: this one's extrusion runs across
     * the craft rather than up it.
     */
    const fin = useMemo(() => {
        const geometry = new THREE.ExtrudeGeometry(
            poly([
                [0, 0],
                [1.25, 0],
                [1.4, 1.25],
                [0.6, 1.3],
            ]),
            { depth: 0.14, bevelEnabled: false },
        );
        geometry.rotateY(-Math.PI / 2);
        return geometry;
    }, []);

    /** Canopy: a stretched dome over the forebody. */
    const canopy = useMemo(() => {
        const geometry = new THREE.SphereGeometry(
            0.6,
            12,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
        );
        geometry.scale(1, 0.8, 2.4);
        return geometry;
    }, []);

    /** Exhaust nozzle, one per boom. */
    const nozzle = useMemo(
        () =>
            new THREE.CylinderGeometry(0.3, 0.42, 0.9, 10).rotateX(
                Math.PI / 2,
            ),
        [],
    );

    /**
     * Thrust plume behind a nozzle, trailing back toward the camera.
     *
     * Short and additive on purpose. A long opaque cone is two solid sticks
     * pointing at the player — it reads as part of the craft rather than as
     * something the craft is emitting, and it covers the track.
     */
    const plume = useMemo(() => {
        const height = 1.15;
        const geometry = new THREE.ConeGeometry(0.2, height, 10).rotateX(
            Math.PI / 2,
        );
        // Fade it out along its length with vertex colours. Additive blending
        // treats black as nothing, so a cone that darkens toward the tip
        // dissolves into the track instead of ending in a hard cut — flat
        // colour made it a solid carrot behind each nozzle.
        const position = geometry.attributes.position;
        const colors = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
            const t = THREE.MathUtils.clamp(
                (height / 2 - position.getZ(i)) / height,
                0,
                1,
            );
            const f = t * t;
            colors.set([f, f, f], i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }, []);

    // A bright outline over each dark body: the shape stays legible against a
    // dark track, and the edges are what bloom picks up.
    const fuselageEdges = useMemo(
        () => new THREE.EdgesGeometry(fuselage, 25),
        [fuselage],
    );
    const wingEdges = useMemo(
        () => new THREE.EdgesGeometry(wings, 25),
        [wings],
    );
    const spineEdges = useMemo(
        () => new THREE.EdgesGeometry(spine, 25),
        [spine],
    );

    // Same reasoning as the obstacles: readable from lit colour alone, with
    // emissive as an addition rather than the only thing holding it up.
    const hullColor = useMemo(
        () => new THREE.Color(palette.neon).multiplyScalar(0.22),
        [palette.neon],
    );

    useFrame((_, delta) => {
        clock.current += Math.min(delta, 1 / 20);
        const beat = Math.sin(clock.current * (8 + playerSpeed * 0.4));

        // The engines flicker faster the quicker the run gets, which is the
        // only on-screen cue that speed has stepped up between levels. Both
        // plumes hang off one group, so this stays a single transform.
        if (engineRef.current) {
            const pulse = 1 + beat * 0.22;
            engineRef.current.scale.set(pulse, pulse, 1 + beat * 0.35);
        }
        if (glowRef.current) {
            glowRef.current.intensity = gameOver ? 0 : 9 + beat * 3;
        }
    });

    const bodyMaterial = (
        <meshStandardMaterial
            color={hullColor}
            emissive={palette.neon}
            emissiveIntensity={0.28}
            roughness={0.3}
            metalness={0.5}
            flatShading
        />
    );

    return (
        // The parts are all drawn in profile space, where the craft runs from
        // z -4.6 to 3.2 and sits on y 0. This puts its middle on the origin.
        <group position={[0, -0.35, 0.7]}>
            <mesh geometry={fuselage}>{bodyMaterial}</mesh>
            <lineSegments geometry={fuselageEdges}>
                <lineBasicMaterial color={palette.neon} toneMapped={false} />
            </lineSegments>

            <group position={[0, 0.24, 0]}>
                <mesh geometry={wings}>{bodyMaterial}</mesh>
                <lineSegments geometry={wingEdges}>
                    <lineBasicMaterial
                        color={palette.neon}
                        toneMapped={false}
                    />
                </lineSegments>
            </group>

            <group position={[0, 0.68, 0]}>
                <mesh geometry={spine}>{bodyMaterial}</mesh>
                <lineSegments geometry={spineEdges}>
                    <lineBasicMaterial
                        color={palette.neon}
                        toneMapped={false}
                    />
                </lineSegments>
            </group>

            {/* Canards and fins, mirrored about the centreline. The fins are
                canted outward, which is what stops the tail reading as one
                slab from directly behind. */}
            {[1, -1].map(side => (
                <group key={side}>
                    <mesh
                        geometry={canard}
                        position={[side * 0.42, 0.3, -2.5]}
                        scale={[side, 1, 1]}
                    >
                        <meshBasicMaterial
                            color={palette.neon}
                            toneMapped={false}
                        />
                    </mesh>
                    <mesh
                        geometry={fin}
                        position={[side * 0.8, 0.55, 1.4]}
                        rotation={[0, 0, -side * 0.34]}
                    >
                        <meshBasicMaterial
                            color={palette.neon}
                            toneMapped={false}
                        />
                    </mesh>
                    {/* Wingtip light: the two points furthest apart on the
                        craft, so they are what tells the player how wide
                        they actually are. */}
                    <mesh position={[side * 3.45, 0.35, 2.45]}>
                        <sphereGeometry args={[0.18, 8, 6]} />
                        <meshBasicMaterial
                            color={palette.accent}
                            toneMapped={false}
                        />
                    </mesh>
                    <mesh geometry={nozzle} position={[side * 0.72, 0.35, 3.0]}>
                        <meshStandardMaterial
                            color={hullColor}
                            roughness={0.4}
                            metalness={0.6}
                        />
                    </mesh>
                </group>
            ))}

            {/* Canopy. Transparent and unlit: it reads as glass over the
                forebody, and gives the accent colour somewhere to sit up
                front instead of only behind. */}
            <mesh geometry={canopy} position={[0, 0.66, -2.1]}>
                <meshBasicMaterial
                    color={palette.accent}
                    toneMapped={false}
                    transparent
                    opacity={0.55}
                />
            </mesh>

            {/* Kept small on purpose: bloom does the rest, and at any real
                size the flare swallows the hull it is supposed to sit
                behind. */}
            <group ref={engineRef}>
                {[1, -1].map(side => (
                    <mesh
                        key={side}
                        geometry={plume}
                        position={[side * 0.72, 0.35, 3.9]}
                    >
                        <meshBasicMaterial
                            color={palette.accent}
                            vertexColors
                            toneMapped={false}
                            transparent
                            opacity={0.75}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>
            <pointLight
                ref={glowRef}
                position={[0, 0.7, 3.4]}
                color={palette.accent}
                distance={60}
            />
        </group>
    );
};

export default PlayerCraft;
