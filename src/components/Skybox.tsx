import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The sky: a dark dome, a deep starfield, a galaxy band and nebula clouds that
 * take the level's colour.
 *
 * It used to be a photograph of maple leaves stretched over a sphere and lit
 * hot pink. Then it was a bare dome with a handful of dots, which was clean
 * but gave a long run nothing to look at — the world outside the track never
 * changed. Everything here is generated, so it costs no download, and it is
 * tinted per level so crossing into a new sector visibly changes the view out
 * of the window as well as the track underneath.
 */
const NEAR_STARS = 900;
const FAR_STARS = 1400;

/** A soft round blob, for stars and nebulae alike. */
const radialTexture = (stops: [number, string][]) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

const starField = (count: number, radius: number) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tint = new THREE.Color();

    for (let i = 0; i < count; i++) {
        // Biased upwards: stars below the horizon are never seen and would
        // only cost fill.
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 0.92 + 0.04);
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi));
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        // Mostly white, some blue and some amber: a uniform field reads as
        // noise rather than as sky.
        const roll = Math.random();
        tint.setHSL(
            roll < 0.7 ? 0.6 : roll < 0.88 ? 0.58 : 0.09,
            roll < 0.7 ? 0.1 : 0.65,
            0.6 + Math.random() * 0.4,
        );
        tint.toArray(colors, i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
};

const Skybox = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const groupRef = useRef<THREE.Group>(null);
    const nebulaRef = useRef<THREE.Group>(null);
    const palette = paletteFor(level);

    const fogColor = useMemo(() => new THREE.Color(palette.fog), [palette.fog]);

    const near = useMemo(() => starField(NEAR_STARS, 700), []);
    const far = useMemo(() => starField(FAR_STARS, 780), []);

    const starTexture = useMemo(
        () =>
            radialTexture([
                [0, 'rgba(255,255,255,1)'],
                [0.4, 'rgba(255,255,255,0.5)'],
                [1, 'rgba(255,255,255,0)'],
            ]),
        [],
    );
    const cloudTexture = useMemo(
        () =>
            radialTexture([
                [0, 'rgba(255,255,255,0.30)'],
                [0.45, 'rgba(255,255,255,0.08)'],
                [1, 'rgba(255,255,255,0)'],
            ]),
        [],
    );

    // A handful of clouds, placed once and re-tinted as levels change.
    const clouds = useMemo(
        () =>
            Array.from({ length: 7 }, (_, i) => {
                const angle = (i / 7) * Math.PI * 2 + Math.random();
                const radius = 560;
                return {
                    key: i,
                    position: [
                        Math.cos(angle) * radius,
                        90 + Math.random() * 260,
                        Math.sin(angle) * radius,
                    ] as [number, number, number],
                    scale: 260 + Math.random() * 320,
                    // Alternate between the level's two colours so the sky has
                    // some variation rather than one flat wash.
                    warm: i % 3 === 0,
                };
            }),
        [],
    );

    useFrame((_, delta) => {
        // The dome travels with the player so it never falls behind.
        groupRef.current?.position.set(...playerPosition);
        // A slow drift, enough to notice over a long run without distracting.
        if (nebulaRef.current) nebulaRef.current.rotation.y += delta * 0.006;
    });

    return (
        <group ref={groupRef}>
            <mesh>
                <sphereGeometry args={[820, 24, 16]} />
                <meshBasicMaterial
                    color={fogColor}
                    side={THREE.BackSide}
                    fog={false}
                />
            </mesh>

            {/* Nebulae and the galaxy band, additive so they build up light
                rather than occluding each other. */}
            <group ref={nebulaRef}>
                {clouds.map(cloud => (
                    <sprite
                        key={cloud.key}
                        position={cloud.position}
                        scale={[cloud.scale, cloud.scale, 1]}
                    >
                        <spriteMaterial
                            map={cloudTexture}
                            color={cloud.warm ? palette.accent : palette.neon}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                            opacity={0.17}
                            fog={false}
                        />
                    </sprite>
                ))}

                {/* The galaxy: one long, thin, tilted band of light. */}
                <sprite position={[0, 300, -420]} scale={[1500, 190, 1]}>
                    <spriteMaterial
                        map={cloudTexture}
                        color={palette.neon}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                        opacity={0.12}
                        fog={false}
                    />
                </sprite>
            </group>

            <points geometry={far}>
                <pointsMaterial
                    map={starTexture}
                    size={3.4}
                    sizeAttenuation={false}
                    vertexColors
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                    fog={false}
                />
            </points>
            <points geometry={near}>
                <pointsMaterial
                    map={starTexture}
                    size={6}
                    sizeAttenuation={false}
                    vertexColors
                    transparent
                    opacity={0.9}
                    depthWrite={false}
                    fog={false}
                />
            </points>
        </group>
    );
};

export default Skybox;
