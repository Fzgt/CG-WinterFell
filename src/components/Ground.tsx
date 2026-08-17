import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
    planeSize,
    trackCurve,
    trackCurveSlope,
    trackHeight,
    trackHeightSlope,
} from '../config/constants';
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
    slot,
    railMaterial,
    rungMaterial,
}: {
    slot: number;
    railMaterial: THREE.Material;
    rungMaterial: THREE.Material;
}) => {
    const tileRef = useRef<THREE.Group>(null);
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

    // Snapped and re-baked in the same callback: the curve is a function of
    // world z, and a recycled tile lands on a new stretch of it. Between
    // snaps the matrices are static.
    //
    // The snap used to live in the parent, and a parent's useFrame is
    // registered *after* its children's — r3f subscribes from a layout effect,
    // and React runs those child-first. So on the frame a tile jumped, this
    // callback had already run and returned early against the old position:
    // the tile was drawn a kilometre up the track wearing the offsets of the
    // stretch it just left, up to 100 units out sideways and 64 vertically.
    // One frame, once per kilometre — and it is exactly the frame the scenery
    // swap then holds on screen while it rebuilds, so the whole grid heaves
    // into view for as long as that takes.
    useFrame(() => {
        const rails = railsRef.current;
        const rungs = rungsRef.current;
        const group = tileRef.current;
        if (!rails || !rungs || !group) return;

        // Snap to a lattice derived from the player's position rather than
        // leapfrogging the tiles past each other: the leapfrog read one tile's
        // position, moved it, then placed the other from that same stale
        // value, so the pair drifted apart over a long run and left gaps.
        // ceil, not floor — travel is toward -Z, so the tile the player stands
        // on starts at the boundary behind them.
        const playerZ = useStore.getState().playerPosition[2];
        const tileZ =
            Math.ceil(playerZ / planeSize) * planeSize - planeSize * slot;
        group.position.z = tileZ;
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
                    0.02 + trackHeight(worldZ),
                    localZ,
                );
                dummy.rotation.set(
                    -Math.atan(trackHeightSlope(worldZ)),
                    Math.atan(trackCurveSlope(worldZ)),
                    0,
                );
                dummy.updateMatrix();
                rails.setMatrixAt(index++, dummy.matrix);
            }
        }
        for (let i = 0; i < rungCount; i++) {
            const localZ = -planeSize / 2 + i * RUNG_SPACING;
            const worldZ = tileZ + localZ;
            dummy.position.set(
                trackCurve(worldZ),
                -0.09 + trackHeight(worldZ),
                localZ,
            );
            dummy.rotation.set(
                -Math.atan(trackHeightSlope(worldZ)),
                Math.atan(trackCurveSlope(worldZ)),
                0,
            );
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
                args={[railGeometry, railMaterial, railCount * segsPerRail]}
                frustumCulled={false}
            />
            {/* The abyss floor: far below the deepest valley the height
                curve can dig, so dips read as real drops, and so looking
                down shows ground rather than the inside of the sky dome. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -110, 0]}>
                <planeGeometry args={[planeSize * 1.6, planeSize]} />
                <meshBasicMaterial color="#04030a" />
            </mesh>
            <instancedMesh
                ref={rungsRef}
                args={[rungGeometry, rungMaterial, rungCount]}
                frustumCulled={false}
            />
        </group>
    );
};

const Ground = () => {
    const level = useStore(state => state.level);

    /**
     * The materials are owned here and recoloured in place, the same way the
     * obstacles and the sky dome are.
     *
     * They used to be declared inside the tiles as `<meshBasicMaterial
     * color={color} />` against a Color instance held up here, on the theory
     * that mutating one object beat handing the material a new one each level.
     * It never reached the material: r3f *copies* a Color prop into
     * `material.color` when it applies it, and the prop's identity never
     * changed afterwards, so no later render even tried. Every level after the
     * first recoloured the sky, the obstacles and the HUD, and left the grid
     * on level 0's cyan.
     */
    const { railMaterial, rungMaterial } = useMemo(
        () => ({
            railMaterial: new THREE.MeshBasicMaterial({ toneMapped: false }),
            // Dimmer, so the ties read as cross members between the rails
            // rather than competing with them for the eye.
            rungMaterial: new THREE.MeshBasicMaterial({
                toneMapped: false,
                transparent: true,
                opacity: 0.28,
            }),
        }),
        [],
    );
    useEffect(() => {
        const neon = paletteFor(level).neon;
        railMaterial.color.set(neon);
        rungMaterial.color.set(neon);
    }, [level, railMaterial, rungMaterial]);

    // Each tile places itself, so nothing here runs per frame at all.
    return (
        <>
            <RailTile
                slot={0.5}
                railMaterial={railMaterial}
                rungMaterial={rungMaterial}
            />
            <RailTile
                slot={1.5}
                railMaterial={railMaterial}
                rungMaterial={rungMaterial}
            />
        </>
    );
};

export default Ground;
