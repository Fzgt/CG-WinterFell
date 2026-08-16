import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The player as a kart: open chassis, four fat wheels, sidepods, a driver in
 * a helmet, and a rear wing over twin exhausts.
 *
 * Same construction rules as the interceptor it shares this folder with —
 * separate thin parts rather than one extrusion, a dark hull lit by the
 * level's neon on its edges, and nothing allocated after the first frame.
 * What differs is what has to survive the viewing angle. The player only ever
 * sees this thing from behind and slightly above, so the silhouette is spent
 * on the four things a kart has and an aircraft does not: wheels standing
 * proud of the body, a wing on struts, a seat back, and a helmet above it.
 * The nose is barely modelled, because nobody will ever look at it.
 *
 * All profiles are drawn nose-toward -y, tail toward +y and extruded along
 * +z; the rotations in `flatten` turn that into nose-toward -z with the
 * extrusion standing up in +y.
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

/** Wheel centre height. Everything else hangs off where the wheels sit. */
const AXLE_Y = -0.5;
const REAR_RADIUS = 0.98;
const FRONT_RADIUS = 0.78;

const KartCraft = () => {
    const level = useStore(state => state.level);
    const playerSpeed = useStore(state => state.playerSpeed);
    const gameOver = useStore(state => state.gameOver);
    const palette = paletteFor(level);

    const wheelsRef = useRef<THREE.Group[]>([]);
    const engineRef = useRef<THREE.Group>(null);
    const glowRef = useRef<THREE.PointLight>(null);
    const clock = useRef(0);
    const spin = useRef(0);

    /** Floor pan: pinched at the nose, widest at the sidepods, square at the
     *  tail where the engine sits. */
    const pan = useMemo(
        () =>
            flatten(
                poly([
                    [0, -3.3],
                    [0.62, -2.5],
                    [0.74, -1.6],
                    [1.4, -0.35],
                    [1.48, 1.6],
                    [1.15, 2.7],
                    [-1.15, 2.7],
                    [-1.48, 1.6],
                    [-1.4, -0.35],
                    [-0.74, -1.6],
                    [-0.62, -2.5],
                ]),
                0.34,
                0.08,
            ),
        [],
    );

    /** Sidepod, one per side: the slab that makes a kart read as wide and
     *  low rather than as a plank with wheels. */
    const sidepod = useMemo(
        () =>
            flatten(
                poly([
                    [0, -1.6],
                    [0.7, -1.0],
                    [0.74, 1.4],
                    [0, 1.85],
                ]),
                0.72,
                0.09,
            ),
        [],
    );

    /** Nose cone and the front wing across it. */
    const nose = useMemo(
        () =>
            flatten(
                poly([
                    [0, -3.6],
                    [0.52, -2.7],
                    [0.36, -1.8],
                    [-0.36, -1.8],
                    [-0.52, -2.7],
                ]),
                0.38,
                0.07,
            ),
        [],
    );

    /**
     * Seat back, drawn in side profile and stood upright — the extrusion runs
     * across the kart rather than up it, so it cannot use `flatten`.
     */
    const seat = useMemo(() => {
        const geometry = new THREE.ExtrudeGeometry(
            poly([
                [0, 0],
                [0.58, 0.05],
                [0.74, 1.24],
                [0.12, 1.36],
            ]),
            { depth: 1.3, bevelEnabled: false },
        );
        geometry.rotateY(-Math.PI / 2);
        // Centre the extrusion on the kart's spine instead of starting there.
        geometry.translate(0.65, 0, 0);
        return geometry;
    }, []);

    /**
     * Rear wing plate: the widest thing above the axle, and the part that says
     * "back of a racing kart" from the only angle on offer.
     *
     * Centred on its own origin, unlike the body panels — those are drawn in
     * place, and a panel that carries its own position cannot also be moved by
     * the group holding it without landing somewhere nobody meant.
     */
    const wing = useMemo(
        () =>
            flatten(
                poly([
                    [2.05, -0.42],
                    [2.05, 0.42],
                    [-2.05, 0.42],
                    [-2.05, -0.42],
                ]),
                0.13,
                0.04,
            ),
        [],
    );

    const wheel = useMemo(
        () =>
            // Axle along x, so the tread faces the way the kart is going.
            new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
        [],
    );
    /**
     * Outline of the tyre.
     *
     * A tyre in this palette is a near-black cylinder, and a near-black
     * cylinder turning against a black track is a still one. The edges give it
     * fourteen bright staves that visibly rotate, which is the only reason the
     * wheels being driven is worth anything.
     */
    const wheelEdges = useMemo(
        () => new THREE.EdgesGeometry(wheel, 1),
        [wheel],
    );

    /** Helmet: a dome, and the single strongest cue that someone is driving. */
    const helmet = useMemo(
        () => new THREE.SphereGeometry(0.5, 14, 10).scale(1, 1.05, 1.1),
        [],
    );

    const steering = useMemo(
        () => new THREE.TorusGeometry(0.42, 0.08, 6, 14),
        [],
    );

    /** Exhaust stack behind the engine, one per side. */
    const pipe = useMemo(
        () => new THREE.CylinderGeometry(0.18, 0.23, 1.2, 8).rotateX(Math.PI / 2),
        [],
    );

    /**
     * Exhaust plume. Short and additive, darkening toward the tip so it
     * dissolves into the track — a flat cone is a solid stick pointing at the
     * camera, which reads as part of the kart rather than as something coming
     * out of it.
     */
    const plume = useMemo(() => {
        const height = 0.8;
        const geometry = new THREE.ConeGeometry(0.12, height, 10).rotateX(
            Math.PI / 2,
        );
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

    const panEdges = useMemo(() => new THREE.EdgesGeometry(pan, 25), [pan]);
    const podEdges = useMemo(
        () => new THREE.EdgesGeometry(sidepod, 25),
        [sidepod],
    );
    const wingEdges = useMemo(() => new THREE.EdgesGeometry(wing, 25), [wing]);
    const seatEdges = useMemo(() => new THREE.EdgesGeometry(seat, 25), [seat]);

    const hullColor = useMemo(
        () => new THREE.Color(palette.neon).multiplyScalar(0.22),
        [palette.neon],
    );
    const tyreColor = useMemo(
        () => new THREE.Color(palette.neon).multiplyScalar(0.16),
        [palette.neon],
    );

    useFrame((_, delta) => {
        const step = Math.min(delta, 1 / 20);
        clock.current += step;
        const beat = Math.sin(clock.current * (8 + playerSpeed * 0.4));

        // Wheels turn at the speed the run is actually going. Without this the
        // kart is a sledge: four cylinders held still while the grid streams
        // past underneath is the one thing that gives away that nothing here
        // is really touching the ground.
        if (!gameOver) {
            spin.current -= (playerSpeed / REAR_RADIUS) * step;
            for (const group of wheelsRef.current) {
                if (group) group.rotation.x = spin.current;
            }
        }

        if (engineRef.current) {
            const pulse = 1 + beat * 0.22;
            engineRef.current.scale.set(pulse, pulse, 1 + beat * 0.35);
        }
        if (glowRef.current) {
            glowRef.current.intensity = gameOver ? 0 : 8 + beat * 3;
        }
    });

    const bodyMaterial = (
        <meshStandardMaterial
            color={hullColor}
            emissive={palette.neon}
            emissiveIntensity={0.28}
            roughness={0.35}
            metalness={0.45}
            flatShading
        />
    );

    const neonLine = (
        <lineBasicMaterial color={palette.neon} toneMapped={false} />
    );

    /** Wheels are placed rather than modelled four times: same cylinder, two
     *  radii, mirrored across the centreline. */
    const wheels: { x: number; z: number; r: number; w: number }[] = [
        { x: 1.95, z: 1.9, r: REAR_RADIUS, w: 0.86 },
        { x: -1.95, z: 1.9, r: REAR_RADIUS, w: 0.86 },
        { x: 1.72, z: -2.2, r: FRONT_RADIUS, w: 0.62 },
        { x: -1.72, z: -2.2, r: FRONT_RADIUS, w: 0.62 },
    ];

    return (
        // Profile space runs z -3.35 to 2.62 with the pan on y 0; this centres
        // the kart on its origin and drops it so the tyres meet the grid.
        <group position={[0, -0.15, 0.4]}>
            <mesh geometry={pan}>{bodyMaterial}</mesh>
            <lineSegments geometry={panEdges}>{neonLine}</lineSegments>

            <mesh geometry={nose} position={[0, 0.02, 0]}>
                {bodyMaterial}
            </mesh>

            {/* Front wing: a plain bar, low and wide, so the nose has a width
                to read against the fat front tyres. */}
            <mesh position={[0, 0.12, -3.25]}>
                <boxGeometry args={[3.1, 0.14, 0.48]} />
                <meshBasicMaterial color={palette.neon} toneMapped={false} />
            </mesh>

            {[1, -1].map(side => (
                <group key={side}>
                    <group position={[side * 1.18, 0.06, 0]} scale={[side, 1, 1]}>
                        <mesh geometry={sidepod}>{bodyMaterial}</mesh>
                        <lineSegments geometry={podEdges}>{neonLine}</lineSegments>
                    </group>
                    <mesh
                        geometry={pipe}
                        position={[side * 0.5, 0.5, 2.8]}
                        rotation={[0.22, 0, 0]}
                    >
                        <meshStandardMaterial
                            color={hullColor}
                            roughness={0.4}
                            metalness={0.6}
                        />
                    </mesh>
                    {/* Wing struts. */}
                    <mesh position={[side * 1.5, 0.86, 2.55]}>
                        <boxGeometry args={[0.14, 1.4, 0.18]} />
                        {bodyMaterial}
                    </mesh>
                    {/* End plate, which is what stops the wing reading as a
                        floating bar. */}
                    <mesh position={[side * 2.1, 1.55, 2.55]}>
                        <boxGeometry args={[0.11, 0.62, 0.95]} />
                        <meshBasicMaterial
                            color={palette.accent}
                            toneMapped={false}
                        />
                    </mesh>
                </group>
            ))}

            {/* Wheels. Each sits in its own group so the spin is one rotation
                on the axle rather than a rebuilt matrix per frame. */}
            {wheels.map((w, i) => (
                <group
                    key={i}
                    ref={group => {
                        if (group) wheelsRef.current[i] = group;
                    }}
                    position={[w.x, AXLE_Y + w.r, w.z]}
                >
                    <mesh geometry={wheel} scale={[w.w, w.r, w.r]}>
                        <meshStandardMaterial
                            color={tyreColor}
                            roughness={0.75}
                            metalness={0.1}
                            flatShading
                        />
                    </mesh>
                    <lineSegments
                        geometry={wheelEdges}
                        scale={[w.w, w.r, w.r]}
                    >
                        <lineBasicMaterial
                            color={palette.neon}
                            toneMapped={false}
                        />
                    </lineSegments>
                    {/* Hub: a bright disc on the outboard face. Flat tyres in
                        this palette are near-black cylinders, and a spinning
                        near-black cylinder does not look like it is spinning. */}
                    <mesh
                        position={[Math.sign(w.x) * (w.w / 2 + 0.03), 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                    >
                        <circleGeometry args={[w.r * 0.42, 10]} />
                        <meshBasicMaterial
                            color={palette.accent}
                            toneMapped={false}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </group>
            ))}

            <group position={[0, 0.3, 0.8]}>
                <mesh geometry={seat}>{bodyMaterial}</mesh>
                <lineSegments geometry={seatEdges}>{neonLine}</lineSegments>
            </group>

            {/* Driver: helmet over the seat back, with the visor facing the
                way the kart is going. Both unlit — the helmet is the one
                thing that should stay legible when the hull goes dark. */}
            <mesh geometry={helmet} position={[0, 1.5, 0.7]}>
                <meshStandardMaterial
                    color={hullColor}
                    emissive={palette.neon}
                    emissiveIntensity={0.4}
                    roughness={0.3}
                    flatShading
                />
            </mesh>
            <mesh
                geometry={helmet}
                position={[0, 1.48, 0.48]}
                scale={[0.86, 0.5, 0.86]}
            >
                <meshBasicMaterial color={palette.accent} toneMapped={false} />
            </mesh>

            <mesh
                geometry={steering}
                position={[0, 0.98, -0.7]}
                rotation={[Math.PI / 2.6, 0, 0]}
            >
                <meshBasicMaterial color={palette.neon} toneMapped={false} />
            </mesh>

            <group position={[0, 1.55, 2.55]}>
                <mesh geometry={wing}>{bodyMaterial}</mesh>
                <lineSegments geometry={wingEdges}>{neonLine}</lineSegments>
            </group>

            <group ref={engineRef}>
                {[1, -1].map(side => (
                    <mesh
                        key={side}
                        geometry={plume}
                        position={[side * 0.5, 0.46, 3.45]}
                    >
                        <meshBasicMaterial
                            color={palette.accent}
                            vertexColors
                            toneMapped={false}
                            transparent
                            opacity={0.6}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>
            <pointLight
                ref={glowRef}
                position={[0, 0.7, 3.3]}
                color={palette.accent}
                distance={55}
            />
            {/* Thrown down onto the grid. There is no shadow pass under the
                player, so without this the kart is lit but the track beneath
                it is not, and it reads as hovering. */}
            <pointLight
                position={[0, AXLE_Y - 0.1, 0.4]}
                color={palette.neon}
                intensity={3.2}
                distance={16}
            />
        </group>
    );
};

export default KartCraft;
