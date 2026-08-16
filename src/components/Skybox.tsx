import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The backdrop: a horizon that glows in the level's colour, a field of light
 * streaks racing overhead, and stars — everything built from meshes.
 *
 * The previous sky used THREE.Points for stars and sprites for nebulae, and
 * on the WebGPU path it rendered as nothing at all: pure black. Meshes and
 * instanced meshes demonstrably work there (the grid and obstacles are made
 * of them), so the whole backdrop now uses only those. The look leans into
 * Cuberun: not scenery, but light — a glowing horizon band and streaks that
 * sell speed.
 */
const STAR_COUNT = 320;
const STREAK_COUNT = 90;
const DOME_RADIUS = 820;

/** Dome with a vertical brightness gradient baked into vertex colours. */
const buildDome = () => {
    const geometry = new THREE.SphereGeometry(DOME_RADIUS, 32, 20);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) / DOME_RADIUS; // -1..1
        // Bright at the horizon, falling off quickly toward the zenith; the
        // material colour multiplies this, so the level decides the hue.
        const brightness =
            y <= 0 ? 1 : Math.pow(Math.max(0, 1 - y), 2.6);
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
};

/** Random transforms on the upper shell, for stars and streaks alike. */
const shellTransforms = (
    count: number,
    minRadius: number,
    maxRadius: number,
) =>
    Array.from({ length: count }, () => {
        const theta = Math.random() * Math.PI * 2;
        // Biased upwards; nothing below the horizon is ever seen.
        const phi = Math.acos(Math.random() * 0.85 + 0.1);
        const r = minRadius + Math.random() * (maxRadius - minRadius);
        return {
            position: new THREE.Vector3(
                r * Math.sin(phi) * Math.cos(theta),
                Math.abs(r * Math.cos(phi)) + 30,
                r * Math.sin(phi) * Math.sin(theta),
            ),
            seed: Math.random(),
        };
    });

const Skybox = () => {
    const level = useStore(state => state.level);
    const groupRef = useRef<THREE.Group>(null);
    const spinRef = useRef<THREE.Group>(null);
    const palette = paletteFor(level);

    const dome = useMemo(buildDome, []);
    const domeMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.BackSide,
                fog: false,
            }),
        [],
    );

    const starGeometry = useMemo(() => new THREE.BoxGeometry(1.6, 1.6, 1.6), []);
    const starMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: '#e8ecff',
                toneMapped: false,
                fog: false,
            }),
        [],
    );

    // Long thin boxes pointing down the direction of travel: speed made
    // visible, which is the whole Cuberun trick.
    const streakGeometry = useMemo(() => new THREE.BoxGeometry(0.7, 0.7, 90), []);
    const streakMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                toneMapped: false,
                transparent: true,
                opacity: 0.5,
                fog: false,
            }),
        [],
    );

    const stars = useMemo(() => shellTransforms(STAR_COUNT, 640, 780), []);
    const streaks = useMemo(() => shellTransforms(STREAK_COUNT, 380, 700), []);

    const starsRef = useRef<THREE.InstancedMesh>(null);
    const streaksRef = useRef<THREE.InstancedMesh>(null);
    const laidOut = useRef(false);
    /** Per-streak travel offset; each one races past and wraps around. */
    const streakOffsets = useRef(
        Float32Array.from({ length: STREAK_COUNT }, () => Math.random() * 1600),
    );
    const streakDummy = useMemo(() => new THREE.Object3D(), []);

    // The level decides the horizon and streak colour; geometry never changes.
    useEffect(() => {
        const neon = new THREE.Color(palette.neon);
        domeMaterial.color.copy(neon).multiplyScalar(0.24);
        streakMaterial.color.copy(new THREE.Color(palette.accent));
    }, [palette.neon, palette.accent, domeMaterial, streakMaterial]);

    useFrame((_, delta) => {
        // The dome travels with the player so it never falls behind, and the
        // shell spins slowly so the view out of the window keeps changing.
        // Read, don't subscribe: the dome is moved by ref, and re-rendering
        // the whole sky to do it re-diffed both instanced meshes every frame.
        groupRef.current?.position.set(
            ...useStore.getState().playerPosition,
        );
        if (spinRef.current) spinRef.current.rotation.y += delta * 0.012;

        // Stars are laid out once; streaks are re-laid every frame below.
        if (!laidOut.current && starsRef.current) {
            const dummy = new THREE.Object3D();
            stars.forEach((star, i) => {
                dummy.position.copy(star.position);
                const s = 0.6 + star.seed * 1.6;
                dummy.scale.set(s, s, s);
                dummy.rotation.set(star.seed * 3, star.seed * 5, 0);
                dummy.updateMatrix();
                starsRef.current!.setMatrixAt(i, dummy.matrix);
            });
            starsRef.current.instanceMatrix.needsUpdate = true;
            laidOut.current = true;
        }

        // Streaks flow: each races backwards past the player at its own
        // speed and wraps to the far distance, so the sky itself is moving —
        // hanging still they read as scratches, not light.
        const mesh = streaksRef.current;
        if (mesh) {
            const offsets = streakOffsets.current;
            streaks.forEach((streak, i) => {
                offsets[i] += delta * (260 + streak.seed * 420);
                if (offsets[i] > 1600) offsets[i] -= 1600;
                streakDummy.position.copy(streak.position);
                streakDummy.position.z += offsets[i] - 800;
                streakDummy.scale.set(1, 1, 0.5 + streak.seed * 1.8);
                streakDummy.updateMatrix();
                mesh.setMatrixAt(i, streakDummy.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef}>
            <mesh geometry={dome} material={domeMaterial} />
            <group ref={spinRef}>
                <instancedMesh
                    ref={starsRef}
                    args={[starGeometry, starMaterial, STAR_COUNT]}
                    frustumCulled={false}
                />
                <instancedMesh
                    ref={streaksRef}
                    args={[streakGeometry, streakMaterial, STREAK_COUNT]}
                    frustumCulled={false}
                />
            </group>
        </group>
    );
};

export default Skybox;
