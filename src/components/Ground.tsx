import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { planeSize } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The floor: a dark plane with a glowing grid over it, recycled ahead of the
 * player in two tiles.
 *
 * It used to be a photographic rock texture with normal, roughness, ao and
 * displacement maps — five downloads to render a flat grey field that swallowed
 * the light. Lines take their colour from the level and are what the bloom pass
 * has to bite on.
 *
 * The grid is built by hand rather than with GridHelper because the two
 * directions want different treatment: rails running away from the player are
 * what convey depth, so they are bright and widely spaced, while the rungs
 * streaming towards them convey speed and would fight the rails for attention
 * at the same brightness.
 */
const RAIL_SPACING = 12;
const RUNG_SPACING = 18;
/** Rails only cover the playable corridor; past it the floor just goes dark. */
const RAIL_HALF_WIDTH = FIELD_WIDTH / 2 + 36;

const buildGrid = (depth: number) => {
    const rails: number[] = [];
    const rungs: number[] = [];

    for (let x = -RAIL_HALF_WIDTH; x <= RAIL_HALF_WIDTH; x += RAIL_SPACING) {
        rails.push(x, 0, -depth / 2, x, 0, depth / 2);
    }
    for (let z = -depth / 2; z <= depth / 2; z += RUNG_SPACING) {
        rungs.push(-RAIL_HALF_WIDTH, 0, z, RAIL_HALF_WIDTH, 0, z);
    }

    const make = (points: number[]) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(points), 3),
        );
        return geometry;
    };

    return { rails: make(rails), rungs: make(rungs) };
};

const GridTile = ({
    tileRef,
    z,
    color,
}: {
    tileRef: React.RefObject<THREE.Group>;
    z: number;
    color: THREE.Color;
}) => {
    const { rails, rungs } = useMemo(() => buildGrid(planeSize), []);

    return (
        <group ref={tileRef} position={[0, 0, z]}>
            <lineSegments geometry={rails}>
                <lineBasicMaterial
                    color={color}
                    transparent
                    opacity={0.95}
                    depthWrite={false}
                />
            </lineSegments>
            <lineSegments geometry={rungs}>
                <lineBasicMaterial
                    color={color}
                    transparent
                    opacity={0.32}
                    depthWrite={false}
                />
            </lineSegments>
        </group>
    );
};

const Ground = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const ground1Ref = useRef<THREE.Group>(null);
    const ground2Ref = useRef<THREE.Group>(null);

    const color = useMemo(
        () => new THREE.Color(paletteFor(level).neon),
        [level],
    );

    useFrame(() => {
        const [, , playerZ] = playerPosition;
        if (!ground1Ref.current || !ground2Ref.current) return;

        const g1Z = ground1Ref.current.position.z;
        const g2Z = ground2Ref.current.position.z;

        if (playerZ < g1Z - planeSize) {
            ground1Ref.current.position.z = g2Z - planeSize;
        }
        if (playerZ < g2Z - planeSize) {
            ground2Ref.current.position.z = g1Z - planeSize;
        }
    });

    return (
        <>
            <GridTile tileRef={ground1Ref} z={-planeSize / 2} color={color} />
            <GridTile
                tileRef={ground2Ref}
                z={-planeSize - planeSize / 2}
                color={color}
            />
        </>
    );
};

export default Ground;
