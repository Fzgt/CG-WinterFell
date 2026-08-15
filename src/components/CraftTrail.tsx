import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { paletteFor } from '../config/levels';

/**
 * The craft's wake.
 *
 * Rendered at the scene root rather than under the player, because the trail
 * has to stay where it was laid down while the craft moves away from it —
 * parented to the craft it would simply travel along and never trail.
 *
 * Samples are taken by distance rather than per frame, so the wake keeps its
 * length and spacing whatever the frame rate is doing.
 */
const SEGMENTS = 22;
const SPACING = 3;

const CraftTrail = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const gameOver = useStore(state => state.gameOver);
    const palette = paletteFor(level);

    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const tint = useMemo(() => new THREE.Color(), []);
    const points = useRef<THREE.Vector3[]>([]);
    const last = useRef(new THREE.Vector3(0, 0, 0));

    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const [x, , z] = playerPosition;
        const here = new THREE.Vector3(x, 2.1, z + 5.5);

        if (!gameOver && (!points.current.length || last.current.distanceTo(here) > SPACING)) {
            points.current.unshift(here);
            points.current.length = Math.min(points.current.length, SEGMENTS);
            last.current.copy(here);
        }

        points.current.forEach((p, i) => {
            const age = i / SEGMENTS;
            // Steep falloff: the wake should be gone in a breath. At the old
            // curve the newest dozen segments were all near full width and
            // full colour, and drawn opaque they merged into one solid slab —
            // it read as a ribbon of carpet dragged behind the ship, not
            // light.
            const fade = Math.pow(1 - age, 2.4);
            dummy.position.copy(p);
            dummy.scale.set(0.9 * fade + 0.06, 0.2 * fade + 0.03, 3.0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            tint.set(palette.neon).multiplyScalar(fade);
            mesh.setColorAt(i, tint);
        });

        mesh.count = points.current.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, SEGMENTS]}
            frustumCulled={false}
        >
            <boxGeometry args={[1, 1, 1]} />
            {/* Additive, so overlapping segments build up glow the way light
                does, instead of stacking into an opaque strip. */}
            <meshBasicMaterial
                transparent
                opacity={0.5}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </instancedMesh>
    );
};

export default CraftTrail;
