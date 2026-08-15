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
        const here = new THREE.Vector3(x, 2.2, z + 3);

        if (!gameOver && (!points.current.length || last.current.distanceTo(here) > SPACING)) {
            points.current.unshift(here);
            points.current.length = Math.min(points.current.length, SEGMENTS);
            last.current.copy(here);
        }

        points.current.forEach((p, i) => {
            const age = i / SEGMENTS;
            const fade = Math.pow(1 - age, 1.6);
            dummy.position.copy(p);
            // Tapers to a point behind, so it reads as a wake and not a row of
            // identical blocks.
            dummy.scale.set(1.5 * fade + 0.08, 0.34 * fade + 0.04, 3.2);
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
            <meshBasicMaterial transparent opacity={0.8} toneMapped={false} />
        </instancedMesh>
    );
};

export default CraftTrail;
