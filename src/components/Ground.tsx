import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { planeSize, trackCurve, trackCurveSlope } from '../config/constants';
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
const RAIL_WIDTH = 0.65;
const RUNG_SPACING = 26;
/**
 * Deep enough to survive a grazing view. At 0.35 units a rung was well under
 * a pixel once it was any distance ahead, and sub-pixel geometry sweeping
 * toward the camera lands on different pixels every frame — the shimmer on
 * the bars nearest the craft. The extra depth is traded against opacity so
 * the visual weight stays the same.
 */
const RUNG_WIDTH = 1.15;
const RAIL_HALF_WIDTH = FIELD_WIDTH / 2;

/**
 * Rails are chopped into short segments so they can follow the winding
 * centreline: each segment sits at the curve's offset for its own world z
 * and yaws along the local slope. Long single boxes could only ever be
 * straight.
 */
const RAIL_SEGMENT = 25;

const RailTile = ({
    tileRef,
    color,
}: {
    tileRef: React.RefObject<THREE.Group>;
    color: THREE.Color;
}) => {
    const railCount = Math.floor((RAIL_HALF_WIDTH * 2) / RAIL_SPACING) + 1;
    const segsPerRail = Math.ceil(planeSize / RAIL_SEGMENT);
    const rungCount = Math.floor(planeSize / RUNG_SPACING) + 1;
    const railsRef = useRef<THREE.InstancedMesh>(null);
    const rungsRef = useRef<THREE.InstancedMesh>(null);

    const railGeometry = useMemo(
        // A hair longer than the step, so yawed neighbours overlap instead of
        // opening gaps on the outside of a bend.
        () => new THREE.BoxGeometry(RAIL_WIDTH, 0.1, RAIL_SEGMENT * 1.12),
        [],
    );
    const rungGeometry = useMemo(
        () => new THREE.BoxGeometry(RAIL_HALF_WIDTH * 2, 0.1, RUNG_WIDTH),
        [],
    );

    // Re-baked whenever the tile snaps to a new lattice position: the curve
    // is a function of world z, and a recycled tile lands on a new stretch
    // of it. Between snaps the matrices are static.
    useFrame(() => {
        const rails = railsRef.current;
        const rungs = rungsRef.current;
        const group = tileRef.current;
        if (!rails || !rungs || !group) return;
        const tileZ = group.position.z;
        if (rails.userData.bakedAt === tileZ) return;

        const dummy = new THREE.Object3D();
        // Rails ride a touch above the rungs. Both used to sit at exactly
        // y=0, and coplanar boxes z-fight where they cross — a shimmer that
        // reads as clipping, worst in the tiles nearest the camera.
        let index = 0;
        for (let i = 0; i < railCount; i++) {
            for (let seg = 0; seg < segsPerRail; seg++) {
                const localZ = -planeSize / 2 + (seg + 0.5) * RAIL_SEGMENT;
                const worldZ = tileZ + localZ;
                dummy.position.set(
                    -RAIL_HALF_WIDTH + i * RAIL_SPACING + trackCurve(worldZ),
                    0.02,
                    localZ,
                );
                dummy.rotation.set(0, Math.atan(trackCurveSlope(worldZ)), 0);
                dummy.updateMatrix();
                rails.setMatrixAt(index++, dummy.matrix);
            }
        }
        for (let i = 0; i < rungCount; i++) {
            const localZ = -planeSize / 2 + i * RUNG_SPACING;
            const worldZ = tileZ + localZ;
            dummy.position.set(trackCurve(worldZ), -0.09, localZ);
            dummy.rotation.set(0, Math.atan(trackCurveSlope(worldZ)), 0);
            dummy.updateMatrix();
            rungs.setMatrixAt(i, dummy.matrix);
        }
        rails.instanceMatrix.needsUpdate = true;
        rungs.instanceMatrix.needsUpdate = true;
        rails.userData.bakedAt = tileZ;
    });

    return (
        <group ref={tileRef}>
            <instancedMesh
                ref={railsRef}
                args={[railGeometry, undefined, railCount * segsPerRail]}
                frustumCulled={false}
            >
                <meshBasicMaterial color={color} toneMapped={false} />
            </instancedMesh>
            {/* Cross lines, dimmer so they read as ties between the rails
                rather than competing with them for the eye. */}
            {/* A dark floor under the grid, so looking down shows ground
                rather than the inside of the sky dome. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
                <planeGeometry args={[planeSize * 1.4, planeSize]} />
                <meshBasicMaterial color="#04030a" />
            </mesh>
            <instancedMesh
                ref={rungsRef}
                args={[rungGeometry, undefined, rungCount]}
                frustumCulled={false}
            >
                <meshBasicMaterial
                    color={color}
                    toneMapped={false}
                    transparent
                    opacity={0.28}
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
