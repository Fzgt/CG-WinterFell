import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
    planeSize,
    trackCurve,
    trackHeight,
} from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { levelAt, LEVELS, type Biome } from '../config/levels';

/**
 * The world beside the track, and it is no longer only a city.
 *
 * Each level is a biome — skyline, neon sea, mountain ranges, ember plains —
 * and the scenery switches with the palette as the run crosses into the next
 * sector. Tiles are keyed by their lattice index instead of being two
 * recycled groups: when the run crosses a tile boundary React drops the tile
 * a kilometre behind and builds the next one ahead, in whatever biome that
 * stretch of world belongs to, with every piece of it sitting on the same
 * winding, rolling centreline as the track (baked in world coordinates at
 * build time — scenery never moves, the player moves past it).
 */

const INNER = FIELD_WIDTH / 2 + 34;

/* ------------------------------------------------------- window texture -- */

const WINDOW_TILE_U = 48;
const WINDOW_TILE_V = 80;

/** Night towers: lighting decided per floor, then per window. */
const buildWindowTexture = () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, size, size);

    const cols = 6;
    const rows = 10;
    const cellW = size / cols;
    const cellH = size / rows;
    for (let row = 0; row < rows; row++) {
        const floorActivity = Math.random() < 0.22 ? 0.55 : 0.06;
        for (let col = 0; col < cols; col++) {
            if (Math.random() > floorActivity) continue;
            const cool = Math.random() > 0.85;
            ctx.fillStyle = cool
                ? `rgba(150, 200, 255, ${0.35 + Math.random() * 0.35})`
                : `rgba(255, 214, 165, ${0.4 + Math.random() * 0.45})`;
            ctx.fillRect(
                col * cellW + cellW * 0.24,
                row * cellH + cellH * 0.28,
                cellW * 0.52,
                cellH * 0.44,
            );
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    return texture;
};

/** Scale a box's UVs so the window grid keeps its world-space density. */
const scaleBoxUVs = (
    geometry: THREE.BoxGeometry,
    w: number,
    h: number,
    d: number,
) => {
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const faceDims: [number, number][] = [
        [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
    ];
    faceDims.forEach(([du, dv], face) => {
        for (let i = face * 4; i < face * 4 + 4; i++) {
            uv.setXY(
                i,
                uv.getX(i) * (du / WINDOW_TILE_U),
                uv.getY(i) * (dv / WINDOW_TILE_V),
            );
        }
    });
};

/* ------------------------------------------------------------- builders -- */

interface TileBuild {
    /** Geometry keyed by which shared material draws it. */
    pieces: Partial<Record<
        'towers' | 'rock' | 'snow' | 'water' | 'moonpath' | 'glow',
        THREE.BufferGeometry
    >>;
    beacons: THREE.Vector3[];
}

const merged = (parts: THREE.BufferGeometry[]) =>
    parts.length ? mergeGeometries(parts) : undefined;

/** Ground level for scenery near world z, just off the track's shoulder. */
const shoulder = (z: number) => trackHeight(z) - 4;

const buildCity = (z0: number, z1: number): TileBuild => {
    const parts: THREE.BufferGeometry[] = [];
    const beacons: THREE.Vector3[] = [];
    const span = z0 - z1;

    const tower = (x: number, z: number, w: number, h: number, d: number) => {
        const box = new THREE.BoxGeometry(w, h, d);
        scaleBoxUVs(box, w, h, d);
        box.translate(x + trackCurve(z), h / 2 + shoulder(z), z);
        parts.push(box);
    };

    for (const side of [-1, 1]) {
        for (let i = 0; i < 18; i++) {
            const x = side * (INNER + Math.random() * 130);
            const z = z0 - (i / 18) * span - Math.random() * 30;
            const w = 16 + Math.random() * 22;
            const d = 16 + Math.random() * 22;
            const h = 45 + Math.random() * 110;
            tower(x, z, w, h, d);
            const roll = Math.random();
            if (roll < 0.4) tower(x, z, w * 0.55, h * 1.22, d * 0.55);
            else if (roll < 0.7) tower(x, z, 1.2, h * 1.4, 1.2);
            if (h > 110) {
                beacons.push(
                    new THREE.Vector3(
                        x + trackCurve(z),
                        h * 1.02 + shoulder(z),
                        z,
                    ),
                );
            }
        }
        for (let i = 0; i < 10; i++) {
            const x = side * (INNER + 170 + Math.random() * 170);
            const z = z0 - (i / 10) * span - Math.random() * 60;
            const w = 30 + Math.random() * 40;
            const d = 30 + Math.random() * 40;
            const h = 120 + Math.random() * 180;
            tower(x, z, w, h, d);
            if (h > 220) {
                beacons.push(
                    new THREE.Vector3(
                        x + trackCurve(z),
                        h * 1.01 + shoulder(z),
                        z,
                    ),
                );
            }
        }
    }
    return { pieces: { towers: merged(parts) }, beacons };
};

const buildMountains = (z0: number, z1: number): TileBuild => {
    const rock: THREE.BufferGeometry[] = [];
    const snow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        // Near foothills, then a far ridge of serious peaks.
        for (const [count, near, far, hLo, hHi] of [
            [9, INNER + 30, INNER + 190, 40, 110],
            [7, INNER + 220, INNER + 420, 130, 260],
        ] as const) {
            for (let i = 0; i < count; i++) {
                const x = side * (near + Math.random() * (far - near));
                const z = z0 - (i / count) * span - Math.random() * 80;
                const h = hLo + Math.random() * (hHi - hLo);
                const r = h * (0.55 + Math.random() * 0.35);
                const cx = x + trackCurve(z);
                const base = shoulder(z) - 6;

                const peak = new THREE.ConeGeometry(r, h, 5, 1);
                peak.rotateY(Math.random() * Math.PI);
                peak.translate(cx, base + h / 2, z);
                rock.push(peak);

                // Snow cap on the tall ones: a small bright cone set into
                // the summit.
                if (h > 120) {
                    const capH = h * 0.22;
                    const cap = new THREE.ConeGeometry(r * 0.24, capH, 5, 1);
                    cap.rotateY(Math.random() * Math.PI);
                    cap.translate(cx, base + h - capH / 2 + 0.5, z);
                    snow.push(cap);
                }
            }
        }
    }
    return {
        pieces: { rock: merged(rock), snow: merged(snow) },
        beacons: [],
    };
};

const buildWater = (z0: number, z1: number): TileBuild => {
    const water: THREE.BufferGeometry[] = [];
    const moon: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];

    // The sea, as strips that follow the terrain in gentle terraces: each
    // 100-unit reach sits at its own level a little below the causeway, so
    // the track reads as a bridge running over open water.
    for (let z = z0; z > z1; z -= 100) {
        const zc = z - 50;
        const level = trackHeight(zc) - 16;
        for (const side of [-1, 1]) {
            const strip = new THREE.BoxGeometry(520, 1, 102);
            strip.translate(
                side * (INNER + 260) + trackCurve(zc),
                level,
                zc,
            );
            water.push(strip);
        }
        // Moonlight: one broken path of light down the water on the right.
        const streak = new THREE.BoxGeometry(
            22 + Math.random() * 10,
            1.2,
            70 + Math.random() * 20,
        );
        streak.translate(
            INNER + 180 + Math.random() * 40 + trackCurve(zc),
            level + 0.4,
            zc,
        );
        moon.push(streak);

        // Scattered glints.
        for (let i = 0; i < 3; i++) {
            const gx =
                (Math.random() < 0.5 ? -1 : 1) *
                (INNER + 40 + Math.random() * 420);
            const g = new THREE.BoxGeometry(2.5, 1.4, 2.5);
            g.translate(
                gx + trackCurve(zc),
                level + 0.5,
                z - Math.random() * 100,
            );
            glow.push(g);
        }
    }
    return {
        pieces: {
            water: merged(water),
            moonpath: merged(moon),
            glow: merged(glow),
        },
        beacons: [],
    };
};

const buildPlains = (z0: number, z1: number): TileBuild => {
    const rock: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const span = z0 - z1;

    for (const side of [-1, 1]) {
        // Low scattered boulders all the way to the horizon fog.
        for (let i = 0; i < 26; i++) {
            const x = side * (INNER + Math.random() * 420);
            const z = z0 - Math.random() * span;
            const w = 3 + Math.random() * 9;
            const h = 2 + Math.random() * 6;
            const b = new THREE.BoxGeometry(w, h, 3 + Math.random() * 9);
            b.rotateY(Math.random() * Math.PI);
            b.translate(x + trackCurve(z), shoulder(z) + h / 2 - 2, z);
            rock.push(b);
        }
        // Crystal spires: thin glowing monoliths, the plains' landmark.
        for (let i = 0; i < 5; i++) {
            const x = side * (INNER + 60 + Math.random() * 300);
            const z = z0 - Math.random() * span;
            const h = 18 + Math.random() * 42;
            const c = new THREE.BoxGeometry(2.2, h, 2.2);
            c.rotateY(Math.random() * 0.8);
            c.translate(x + trackCurve(z), shoulder(z) + h / 2 - 2, z);
            glow.push(c);
        }
    }
    return { pieces: { rock: merged(rock), glow: merged(glow) }, beacons: [] };
};

const buildTile = (index: number): TileBuild => {
    const z0 = -index * planeSize;
    const z1 = -(index + 1) * planeSize;
    const centre = Math.abs((z0 + z1) / 2);
    const biome: Biome = LEVELS[levelAt(centre) % LEVELS.length].biome;
    switch (biome) {
        case 'mountains':
            return buildMountains(z0, z1);
        case 'water':
            return buildWater(z0, z1);
        case 'plains':
            return buildPlains(z0, z1);
        default:
            return buildCity(z0, z1);
    }
};

/* ------------------------------------------------------------ component -- */

interface SharedMaterials {
    towers: THREE.MeshBasicMaterial;
    beacon: THREE.MeshBasicMaterial;
    rock: THREE.MeshStandardMaterial;
    snow: THREE.MeshBasicMaterial;
    water: THREE.MeshBasicMaterial;
    moonpath: THREE.MeshBasicMaterial;
    glow: THREE.MeshBasicMaterial;
}

const SceneryTile = ({
    index,
    materials,
}: {
    index: number;
    materials: SharedMaterials;
}) => {
    const build = useMemo(() => buildTile(index), [index]);
    const beaconRef = useRef<THREE.InstancedMesh>(null);
    const beaconGeometry = useMemo(
        () => new THREE.BoxGeometry(2.4, 2.4, 2.4),
        [],
    );

    useFrame(() => {
        const mesh = beaconRef.current;
        if (!mesh || mesh.userData.laidOut) return;
        const dummy = new THREE.Object3D();
        build.beacons.forEach((p, i) => {
            dummy.position.copy(p);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.laidOut = true;
    });

    return (
        <group>
            {(
                Object.entries(build.pieces) as [
                    keyof SharedMaterials & keyof TileBuild['pieces'],
                    THREE.BufferGeometry,
                ][]
            ).map(([key, geometry]) => (
                <mesh key={key} geometry={geometry} material={materials[key]} />
            ))}
            {build.beacons.length > 0 && (
                <instancedMesh
                    ref={beaconRef}
                    args={[beaconGeometry, materials.beacon, build.beacons.length]}
                    frustumCulled={false}
                />
            )}
        </group>
    );
};

const Scenery = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const [anchor, setAnchor] = useState(0);

    const materials = useMemo<SharedMaterials>(
        () => ({
            towers: new THREE.MeshBasicMaterial({ map: buildWindowTexture() }),
            beacon: new THREE.MeshBasicMaterial({
                color: '#ff3b4d',
                toneMapped: false,
                transparent: true,
            }),
            rock: new THREE.MeshStandardMaterial({
                color: '#171a30',
                roughness: 0.95,
                metalness: 0.05,
                flatShading: true,
            }),
            snow: new THREE.MeshBasicMaterial({ color: '#aebbdd' }),
            water: new THREE.MeshBasicMaterial({ color: '#071d34' }),
            moonpath: new THREE.MeshBasicMaterial({
                color: '#9fd8ff',
                toneMapped: false,
                transparent: true,
                opacity: 0.32,
            }),
            glow: new THREE.MeshBasicMaterial({
                color: '#ffc37a',
                toneMapped: false,
            }),
        }),
        [],
    );

    useFrame(({ clock }) => {
        materials.beacon.opacity =
            0.25 + 0.75 * Math.abs(Math.sin(clock.elapsedTime * 1.6));
        // The moon path shimmers, barely.
        materials.moonpath.opacity =
            0.26 + 0.1 * Math.sin(clock.elapsedTime * 0.7);

        const next = Math.max(0, Math.floor(-playerPosition[2] / planeSize));
        if (next !== anchor) setAnchor(next);
    });

    return (
        <>
            <SceneryTile index={anchor} materials={materials} />
            <SceneryTile index={anchor + 1} materials={materials} />
        </>
    );
};

export default Scenery;
