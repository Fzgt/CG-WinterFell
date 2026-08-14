import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { randomInRange2 } from '../utils/utils';
import { FIELD_WIDTH, SECTION_LENGTH, VISIBLE_SECTIONS } from '../config/obstacles';
import { getSectionObstacles } from '../utils/obstacleRegistry';
import { paletteFor } from '../config/levels';
import { playPickup, playPenalty } from '../utils/audio';

/**
 * Things to collect, and things not to.
 *
 * This replaces five separate GLB collectibles — candy corn, a treasure chest,
 * a ghost, a sweet and a bottle — each with its own model, scale, particle
 * colour and rotation config. In a world made of light they all read as clutter
 * from a different game, and they were five more downloads. Two generated
 * shapes carry the same rules: an orb worth points, a spike that costs them.
 */
type Kind = 'orb' | 'spike';

const KINDS: {
    kind: Kind;
    perSection: number;
    score: number;
    /** Orbs float at head height, spikes sit low so they read as ground hazards. */
    height: number;
}[] = [
    { kind: 'orb', perSection: 26, score: 10, height: 4.5 },
    { kind: 'spike', perSection: 10, score: -25, height: 2.6 },
];

const HIT_RADIUS = 5.5;
/** Keep pickups clear of obstacles, so none is impossible to take. */
const OBSTACLE_CLEARANCE = 10;

const sectionBounds = (section: number) =>
    section === 0
        ? [-250, -SECTION_LENGTH]
        : [-section * SECTION_LENGTH, -section * SECTION_LENGTH - SECTION_LENGTH];

const generatePositions = (
    section: number,
    count: number,
    height: number,
): THREE.Vector3[] => {
    const [startZ, endZ] = sectionBounds(section);
    const obstacles = getSectionObstacles(section);
    const positions: THREE.Vector3[] = [];

    for (let attempt = 0; attempt < count * 8 && positions.length < count; attempt++) {
        const x = randomInRange2(-FIELD_WIDTH / 2, FIELD_WIDTH / 2);
        const z = randomInRange2(startZ, endZ);

        const nearObstacle = obstacles.some(
            o =>
                (o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) <
                OBSTACLE_CLEARANCE * OBSTACLE_CLEARANCE,
        );
        if (nearObstacle) continue;

        positions.push(new THREE.Vector3(x, height, z));
    }
    return positions;
};

const PickupSection = ({
    sectionIndex,
    kind,
    perSection,
    score,
    height,
    color,
}: {
    sectionIndex: number;
    kind: Kind;
    perSection: number;
    score: number;
    height: number;
    color: string;
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const time = useRef(0);
    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const addScore = useStore(state => state.addScore);
    const reduceScore = useStore(state => state.reduceScore);
    const addScoreEvent = useStore(state => state.addScoreEvent);
    const reduceScoreEvent = useStore(state => state.reduceScoreEvent);

    const [positions] = useState(() =>
        generatePositions(sectionIndex, perSection, height),
    );
    const taken = useRef<Set<number>>(new Set());

    const geometry = useMemo(
        () =>
            kind === 'orb'
                ? new THREE.OctahedronGeometry(2.1)
                : new THREE.TetrahedronGeometry(2.8),
        [kind],
    );

    const material = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: '#05040a',
                emissive: new THREE.Color(color),
                emissiveIntensity: kind === 'orb' ? 2.2 : 1.8,
                roughness: 0.3,
            }),
        [color, kind],
    );

    useFrame((_, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        time.current += Math.min(delta, 1 / 20);

        if (!gameOver) {
            const [px, , pz] = playerPosition;
            positions.forEach((p, i) => {
                if (taken.current.has(i)) return;
                const dx = p.x - px;
                const dz = p.z - pz;
                if (dx * dx + dz * dz > HIT_RADIUS * HIT_RADIUS) return;

                taken.current.add(i);
                if (score >= 0) {
                    addScore(score);
                    addScoreEvent([p.x, p.y, p.z], score);
                    playPickup();
                } else {
                    reduceScore(-score);
                    reduceScoreEvent([p.x, p.y, p.z], score);
                    playPenalty();
                }
            });
        }

        // Rebuild the instance list from what is left, so collected pickups
        // simply stop being drawn.
        let visible = 0;
        positions.forEach((p, i) => {
            if (taken.current.has(i)) return;
            dummy.position.set(
                p.x,
                p.y + Math.sin(time.current * 2 + i) * 0.9,
                p.z,
            );
            dummy.rotation.set(0, time.current * 1.5 + i, time.current * 0.6);
            dummy.updateMatrix();
            mesh.setMatrixAt(visible, dummy.matrix);
            visible++;
        });
        mesh.count = visible;
        mesh.instanceMatrix.needsUpdate = true;
    });

    if (!positions.length) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, positions.length]}
        />
    );
};

const PickupField = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const gameOver = useStore(state => state.gameOver);
    const level = useStore(state => state.level);
    const [current, setCurrent] = useState(0);
    const [sections, setSections] = useState<number[]>([0, 1, 2]);

    const palette = paletteFor(level);

    useFrame(() => {
        if (gameOver) return;
        const next = Math.floor(Math.abs(playerPosition[2]) / SECTION_LENGTH);
        if (next > current) {
            setCurrent(next);
            setSections(
                Array.from({ length: VISIBLE_SECTIONS }, (_, i) => next + i),
            );
        }
    });

    return (
        <>
            {sections.map(sectionIndex =>
                KINDS.map(({ kind, perSection, score, height }) => (
                    <PickupSection
                        key={`${kind}-${sectionIndex}`}
                        sectionIndex={sectionIndex}
                        kind={kind}
                        perSection={perSection}
                        score={score}
                        height={height}
                        color={kind === 'orb' ? palette.accent : '#ff2d55'}
                    />
                )),
            )}
        </>
    );
};

export default PickupField;
