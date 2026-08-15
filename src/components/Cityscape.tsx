import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planeSize } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';

/**
 * The skyline flanking the track.
 *
 * The first version dressed the buildings in the obstacles' own language —
 * dark body, neon edge frame — and at speed the two were indistinguishable:
 * the scenery looked like the danger. The city now speaks skyscraper instead:
 * tall black towers full of lit windows, stepped crowns, antennas, and red
 * aviation beacons blinking on the tallest roofs. Warm window light against
 * the track's cold neon, so what glows in the level colour is a threat and
 * what glows warm is backdrop.
 *
 * Each tile's towers are merged into a single geometry (one draw call per
 * tile), with each box's UVs scaled by its own dimensions so the window grid
 * keeps its density on every size of tower instead of stretching.
 */
const NEAR_PER_SIDE = 18;
const FAR_PER_SIDE = 10;
/** Clear dark gap between the grid's edge and the first tower. */
const CITY_INNER = FIELD_WIDTH / 2 + 34;
const CITY_NEAR_OUTER = CITY_INNER + 130;
const CITY_FAR_INNER = CITY_NEAR_OUTER + 40;
const CITY_FAR_OUTER = CITY_FAR_INNER + 170;
/**
 * World units covered by one repeat of the window texture (u, v).
 *
 * The first pass packed a window into every ~2.8 units, and with nearly half
 * of them lit a 300-unit tower became thousands of uniform dots — dense
 * enough to trip the same response as a lotus pod. Windows are now ~8 units,
 * far fewer are lit, and lighting clusters by floor.
 */
const WINDOW_TILE_U = 48;
const WINDOW_TILE_V = 80;

/**
 * A tile of windows. Night towers are mostly dark: lighting is decided per
 * floor first — a few floors awake, most asleep — and only then per window,
 * so lights arrive in horizontal runs with the odd loner, instead of an even
 * speckle across the whole face.
 */
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
        // Is this floor awake? Most are not.
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
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices each.
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

interface TileBuild {
    geometry: THREE.BufferGeometry;
    /** Roof positions of the tallest towers, for the beacons. */
    beacons: THREE.Vector3[];
}

const tower = (
    parts: THREE.BufferGeometry[],
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
) => {
    const box = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(box, w, h, d);
    box.translate(x, h / 2, z);
    parts.push(box);
};

const buildTile = (): TileBuild => {
    const parts: THREE.BufferGeometry[] = [];
    const beacons: THREE.Vector3[] = [];

    for (const side of [-1, 1]) {
        // Near row: tall towers with detail.
        for (let i = 0; i < NEAR_PER_SIDE; i++) {
            const x =
                side *
                (CITY_INNER + Math.random() * (CITY_NEAR_OUTER - CITY_INNER));
            const z =
                -planeSize / 2 +
                (i / NEAR_PER_SIDE) * planeSize +
                Math.random() * 30;
            const w = 16 + Math.random() * 22;
            const d = 16 + Math.random() * 22;
            const h = 45 + Math.random() * 110;
            tower(parts, x, z, w, h, d);

            // A stepped crown on some, an antenna on others: a skyline is
            // silhouettes, and identical boxes have none.
            const roll = Math.random();
            if (roll < 0.4) {
                tower(parts, x, z, w * 0.55, h * 1.22, d * 0.55);
            } else if (roll < 0.7) {
                tower(parts, x, z, 1.2, h * 1.4, 1.2);
            }
            if (h > 110) beacons.push(new THREE.Vector3(x, h * 1.02, z));
        }

        // Far row: mega-towers, pure silhouette against the horizon glow.
        for (let i = 0; i < FAR_PER_SIDE; i++) {
            const x =
                side *
                (CITY_FAR_INNER +
                    Math.random() * (CITY_FAR_OUTER - CITY_FAR_INNER));
            const z =
                -planeSize / 2 +
                (i / FAR_PER_SIDE) * planeSize +
                Math.random() * 60;
            const w = 30 + Math.random() * 40;
            const d = 30 + Math.random() * 40;
            const h = 120 + Math.random() * 180;
            tower(parts, x, z, w, h, d);
            if (h > 220) beacons.push(new THREE.Vector3(x, h * 1.01, z));
        }
    }

    return { geometry: mergeGeometries(parts), beacons };
};

const CityTile = ({
    tileRef,
    build,
    material,
    beaconMaterial,
}: {
    tileRef: React.RefObject<THREE.Group>;
    build: TileBuild;
    material: THREE.MeshBasicMaterial;
    beaconMaterial: THREE.MeshBasicMaterial;
}) => {
    const beaconRef = useRef<THREE.InstancedMesh>(null);
    const beaconGeometry = useMemo(() => new THREE.BoxGeometry(2.4, 2.4, 2.4), []);

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
        <group ref={tileRef}>
            <mesh geometry={build.geometry} material={material} />
            {build.beacons.length > 0 && (
                <instancedMesh
                    ref={beaconRef}
                    args={[beaconGeometry, beaconMaterial, build.beacons.length]}
                    frustumCulled={false}
                />
            )}
        </group>
    );
};

const Cityscape = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const tile1 = useRef<THREE.Group>(null);
    const tile2 = useRef<THREE.Group>(null);

    const material = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                map: buildWindowTexture(),
                // Deliberately not tinted by the level: the city stays warm
                // and neutral so it can never be mistaken for the neon that
                // marks the actual danger.
            }),
        [],
    );
    const beaconMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: '#ff3b4d',
                toneMapped: false,
                transparent: true,
            }),
        [],
    );

    const build1 = useMemo(buildTile, []);
    const build2 = useMemo(buildTile, []);

    useFrame(({ clock }) => {
        // Aviation beacons blink slowly, all in phase — a city rhythm.
        beaconMaterial.opacity = 0.25 + 0.75 * Math.abs(Math.sin(clock.elapsedTime * 1.6));

        const [, , playerZ] = playerPosition;
        if (!tile1.current || !tile2.current) return;
        // Same drift-proof lattice as the ground tiles.
        const base = Math.ceil(playerZ / planeSize) * planeSize;
        tile1.current.position.z = base - planeSize / 2;
        tile2.current.position.z = base - planeSize * 1.5;
    });

    return (
        <>
            <CityTile
                tileRef={tile1}
                build={build1}
                material={material}
                beaconMaterial={beaconMaterial}
            />
            <CityTile
                tileRef={tile2}
                build={build2}
                material={material}
                beaconMaterial={beaconMaterial}
            />
        </>
    );
};

export default Cityscape;
