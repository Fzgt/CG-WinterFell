import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planeSize } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * A skyline flanking the track.
 *
 * Past the playable corridor the world used to be nothing at all, which made
 * the track feel like it was suspended in a void. Two strips of dark towers
 * with lit edges now run along both sides — silhouettes only, well outside
 * the reachable width, recycled ahead of the player on the same lattice as
 * the ground tiles. Distance fog fades them into the horizon glow, which is
 * where the city look comes from.
 */
const BUILDINGS_PER_SIDE = 22;
/** Clear margin between the track edge and the nearest tower. */
const CITY_INNER = FIELD_WIDTH / 2 + 24;
const CITY_OUTER = CITY_INNER + 150;
const EDGE = 0.05;

/** Unit box, origin at the base, plus its 12-edge frame. */
const buildUnitFrame = () => {
    const parts: THREE.BufferGeometry[] = [];
    const beam = (
        sx: number, sy: number, sz: number,
        x: number, y: number, z: number,
    ) => {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        g.translate(x, y, z);
        parts.push(g);
    };
    for (const x of [-0.5, 0.5])
        for (const z of [-0.5, 0.5]) beam(EDGE, 1, EDGE, x, 0.5, z);
    for (const y of [0, 1]) {
        for (const z of [-0.5, 0.5]) beam(1, EDGE, EDGE, 0, y, z);
        for (const x of [-0.5, 0.5]) beam(EDGE, EDGE, 1, x, y, 0);
    }
    return mergeGeometries(parts);
};

interface Building {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
}

const buildingsForTile = (): Building[] => {
    const out: Building[] = [];
    for (const side of [-1, 1]) {
        for (let i = 0; i < BUILDINGS_PER_SIDE; i++) {
            out.push({
                x: side * (CITY_INNER + Math.random() * (CITY_OUTER - CITY_INNER)),
                z: -planeSize / 2 + (i / BUILDINGS_PER_SIDE) * planeSize +
                    Math.random() * 24,
                width: 12 + Math.random() * 20,
                height: 22 + Math.random() * 75,
                depth: 12 + Math.random() * 20,
            });
        }
    }
    return out;
};

const CityTile = ({
    tileRef,
    buildings,
    bodyMaterial,
    frameMaterial,
    bodyGeometry,
    frameGeometry,
}: {
    tileRef: React.RefObject<THREE.Group>;
    buildings: Building[];
    bodyMaterial: THREE.MeshBasicMaterial;
    frameMaterial: THREE.MeshBasicMaterial;
    bodyGeometry: THREE.BufferGeometry;
    frameGeometry: THREE.BufferGeometry;
}) => {
    const bodyRef = useRef<THREE.InstancedMesh>(null);
    const frameRef = useRef<THREE.InstancedMesh>(null);

    useFrame(() => {
        const body = bodyRef.current;
        const frame = frameRef.current;
        if (!body || !frame || body.userData.laidOut) return;

        const dummy = new THREE.Object3D();
        buildings.forEach((b, i) => {
            dummy.position.set(b.x, 0, b.z);
            dummy.scale.set(b.width, b.height, b.depth);
            dummy.updateMatrix();
            body.setMatrixAt(i, dummy.matrix);
            frame.setMatrixAt(i, dummy.matrix);
        });
        body.instanceMatrix.needsUpdate = true;
        frame.instanceMatrix.needsUpdate = true;
        body.userData.laidOut = true;
    });

    return (
        <group ref={tileRef}>
            <instancedMesh
                ref={bodyRef}
                args={[bodyGeometry, bodyMaterial, buildings.length]}
                frustumCulled={false}
            />
            <instancedMesh
                ref={frameRef}
                args={[frameGeometry, frameMaterial, buildings.length]}
                frustumCulled={false}
            />
        </group>
    );
};

const Cityscape = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const tile1 = useRef<THREE.Group>(null);
    const tile2 = useRef<THREE.Group>(null);
    const palette = paletteFor(level);

    const bodyGeometry = useMemo(() => {
        const g = new THREE.BoxGeometry(1, 1, 1);
        g.translate(0, 0.5, 0); // origin at the base
        return g;
    }, []);
    const frameGeometry = useMemo(buildUnitFrame, []);
    const bodyMaterial = useMemo(
        () => new THREE.MeshBasicMaterial(),
        [],
    );
    const frameMaterial = useMemo(
        () => new THREE.MeshBasicMaterial({ toneMapped: false }),
        [],
    );

    // Two different skylines, so the repeat is not obvious.
    const buildings1 = useMemo(buildingsForTile, []);
    const buildings2 = useMemo(buildingsForTile, []);

    useFrame(() => {
        // Skyline sits back from the neon: dark silhouettes, dim lit edges.
        const neon = new THREE.Color(palette.neon);
        bodyMaterial.color.copy(neon).multiplyScalar(0.05);
        frameMaterial.color.copy(neon).multiplyScalar(0.42);

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
                buildings={buildings1}
                bodyGeometry={bodyGeometry}
                frameGeometry={frameGeometry}
                bodyMaterial={bodyMaterial}
                frameMaterial={frameMaterial}
            />
            <CityTile
                tileRef={tile2}
                buildings={buildings2}
                bodyGeometry={bodyGeometry}
                frameGeometry={frameGeometry}
                bodyMaterial={bodyMaterial}
                frameMaterial={frameMaterial}
            />
        </>
    );
};

export default Cityscape;
