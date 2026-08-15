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
 * Everything here is thin boxes rather than lines. WebGL ignores line width, so
 * a LineSegments grid is always one pixel wide, and one-pixel geometry does not
 * survive the bloom pass: the grid rendered perfectly with post-processing off
 * and disappeared with it on. Geometry with actual width both survives and can
 * be made genuinely bright.
 *
 * The grid spans exactly the width the craft can steer across, so what you can
 * see is what you can use.
 */
const RAIL_SPACING = 10;
const RAIL_WIDTH = 0.55;
const RUNG_SPACING = 26;
const RUNG_WIDTH = 0.35;
const RAIL_HALF_WIDTH = FIELD_WIDTH / 2;

const RailTile = ({
    tileRef,
    color,
}: {
    tileRef: React.RefObject<THREE.Group>;
    color: THREE.Color;
}) => {
    const railCount = Math.floor((RAIL_HALF_WIDTH * 2) / RAIL_SPACING) + 1;
    const rungCount = Math.floor(planeSize / RUNG_SPACING) + 1;
    const railsRef = useRef<THREE.InstancedMesh>(null);
    const rungsRef = useRef<THREE.InstancedMesh>(null);

    const railGeometry = useMemo(
        () => new THREE.BoxGeometry(RAIL_WIDTH, 0.1, planeSize),
        [],
    );
    const rungGeometry = useMemo(
        () => new THREE.BoxGeometry(RAIL_HALF_WIDTH * 2, 0.1, RUNG_WIDTH),
        [],
    );

    // Laid out once, on the first frame after the refs attach; only the tile's
    // own position moves after that.
    useFrame(() => {
        const rails = railsRef.current;
        const rungs = rungsRef.current;
        if (!rails || !rungs || rails.userData.laidOut) return;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < railCount; i++) {
            dummy.position.set(-RAIL_HALF_WIDTH + i * RAIL_SPACING, 0, 0);
            dummy.updateMatrix();
            rails.setMatrixAt(i, dummy.matrix);
        }
        for (let i = 0; i < rungCount; i++) {
            dummy.position.set(0, 0, -planeSize / 2 + i * RUNG_SPACING);
            dummy.updateMatrix();
            rungs.setMatrixAt(i, dummy.matrix);
        }
        rails.instanceMatrix.needsUpdate = true;
        rungs.instanceMatrix.needsUpdate = true;
        rails.userData.laidOut = true;
    });

    return (
        <group ref={tileRef}>
            <instancedMesh
                ref={railsRef}
                args={[railGeometry, undefined, railCount]}
                frustumCulled={false}
            >
                <meshBasicMaterial color={color} toneMapped={false} />
            </instancedMesh>
            {/* Cross lines, dimmer so they read as ties between the rails
                rather than competing with them for the eye. */}
            <instancedMesh
                ref={rungsRef}
                args={[rungGeometry, undefined, rungCount]}
                frustumCulled={false}
            >
                <meshBasicMaterial
                    color={color}
                    toneMapped={false}
                    transparent
                    opacity={0.38}
                />
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
