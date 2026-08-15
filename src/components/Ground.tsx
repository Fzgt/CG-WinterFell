import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { planeSize } from '../config/constants';
import { FIELD_WIDTH } from '../config/obstacles';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The floor: glowing rails running away from the player, converging on the
 * horizon, recycled ahead of them in two tiles.
 *
 * It used to be a photographic rock texture with normal, roughness, ao and
 * displacement maps — five downloads for a flat grey field that swallowed the
 * light.
 *
 * The rails are thin boxes rather than lines. WebGL ignores line width, so a
 * LineSegments grid is always one pixel wide, and one-pixel geometry does not
 * survive the bloom pass: the grid rendered perfectly with post-processing off
 * and disappeared with it on. Geometry with actual width both survives and can
 * be made genuinely bright.
 */
const RAIL_SPACING = 9;
const RAIL_WIDTH = 0.5;
/** Rails cover the corridor plus a margin; past that the floor goes dark. */
const RAIL_HALF_WIDTH = FIELD_WIDTH / 2 + 40;

const RailTile = ({
    tileRef,
    color,
}: {
    tileRef: React.RefObject<THREE.Group>;
    color: THREE.Color;
}) => {
    const count = Math.floor((RAIL_HALF_WIDTH * 2) / RAIL_SPACING) + 1;
    const meshRef = useRef<THREE.InstancedMesh>(null);

    const geometry = useMemo(
        () => new THREE.BoxGeometry(RAIL_WIDTH, 0.1, planeSize),
        [],
    );

    // Laid out once, on the first frame after the ref is attached; only the
    // tile's own position moves after that.
    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh || mesh.userData.laidOut) return;
        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            dummy.position.set(-RAIL_HALF_WIDTH + i * RAIL_SPACING, 0, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.laidOut = true;
    });

    return (
        <group ref={tileRef}>
            <instancedMesh
                ref={meshRef}
                args={[geometry, undefined, count]}
                frustumCulled={false}
            >
                <meshBasicMaterial color={color} toneMapped={false} />
            </instancedMesh>
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

        // Snap both tiles to a lattice derived from the player's position
        // rather than leapfrogging them past each other: the leapfrog read one
        // tile's position, moved it, then placed the other from that same stale
        // value, so the pair drifted apart over a long run and left gaps.
        // ceil, not floor — travel is toward -Z, so the tile the player stands
        // on starts at the boundary behind them.
        const base = Math.ceil(playerZ / planeSize) * planeSize;
        ground1Ref.current.position.z = base - planeSize / 2;
        ground2Ref.current.position.z = base - planeSize * 1.5;
    });

    return (
        <>
            <RailTile tileRef={ground1Ref} color={color} />
            <RailTile tileRef={ground2Ref} color={color} />
        </>
    );
};

export default Ground;
