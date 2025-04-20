/**
 * MonsterTerrainGenerator Component
 * 
 * Generates and manages monster-filled terrain of different types (diamond, tunnel, wall).
 * Key Features:
 * - Creates terrain patterns with monsters placed in specific formations
 * - Efficiently recycles monsters when they go out of view
 * - Supports animations for monsters
 * - Maintains seamless terrain continuity
 * 
 * Props:
 * - terrainType: Shape of the terrain ('diamond', 'tunnel', or 'wall')
 * - monsterModel: 3D model used for monsters
 * - Various configuration options for terrain size, monster count, etc.
 */
import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { planeSize, wallRadius, leftBound, cubeSize } from '../constants';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Type definitions for component interfaces
type TerrainType = 'diamond' | 'tunnel' | 'wall';

interface MonsterInstance {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
    object: THREE.Object3D;
    mixer?: THREE.AnimationMixer;
    // Tracks which coordinate pattern this monster follows
    originalIndex?: number;
}

interface TerrainProps {
    terrainType: TerrainType;
    monsterModel: THREE.Object3D;
    monsterAnimations?: THREE.AnimationClip[];
    monsterCount?: number;
    Yposition?: number;
    gapSize?: number;
    tunnelLength?: number;
    diamondSize?: number;
    monsterScale?: number;
    monsterRotation?: [number, number, number];
    xPosition?: number;
}

const MonsterTerrainGenerator = ({
    terrainType = 'diamond',
    monsterModel,
    monsterAnimations = [],
    monsterCount = 20,
    Yposition = 0,
    gapSize = 3,
    tunnelLength = 10,
    diamondSize = 21,
    monsterScale = 0.05,
    monsterRotation = [0, 0, 0],
    xPosition = 350
}: TerrainProps) => {
    // Calculate terrain segmentation and bounds
    const segments = (planeSize - wallRadius / 2) / cubeSize;
    const negativeBound = -(planeSize / 2) + wallRadius / 2;

    // Refs for managing instances and state
    const terrainRef = useRef<THREE.Group>(null);
    const shipPositionRef = useRef([0, 0, 0]);
    const instancesRef = useRef<MonsterInstance[]>([]);
    const originalCoordsRef = useRef<[number, number, number][]>([]); // Stores the original coordinate patterns

    /**
     * Generates coordinate patterns based on terrain type
     * @param type The type of terrain to generate
     * @returns Array of [x,y,z] coordinates for monster placement
     */
    const generateTerrainCoordinates = (type: TerrainType) => {
        switch (type) {
            case 'wall': return generateWallCoordinates(gapSize);
            case 'tunnel': return generateTunnelCoordinates(tunnelLength, xPosition);
            case 'diamond': return generateDiamondCoordinates(diamondSize, tunnelLength);
            default: return [];
        }
    };

    /**
     * Generates coordinates for wall-type terrain
     * Creates a zig-zag pattern of monsters along the Z-axis
     * @param gapSize Size of the gap in the center of the wall
     */
    const generateWallCoordinates = (gapSize: number) => {
        const coords: [number, number, number][] = [];
        // Create zig-zag pattern
        for (let i = 0; i < segments; i++) {
            const x = negativeBound + i * cubeSize;
            const z = i <= segments / 2
                ? -(i * cubeSize)
                : -(segments * cubeSize) + i * cubeSize;
            coords.push([x, Yposition, z]);
        }

        // Create gap in center if specified
        if (gapSize > 0) {
            const start = Math.floor(segments / 2 - gapSize / 2);
            coords.splice(start, gapSize);
        }

        // Adjust for left boundary
        if (leftBound < planeSize / 2) {
            const spliceFactor = (planeSize / 2 + leftBound) / cubeSize - 1;
            coords.splice(0, spliceFactor);
            coords.splice(-spliceFactor, spliceFactor);
        }

        return coords;
    };

    /**
     * Generates coordinates for tunnel-type terrain
     * Creates alternating monsters on left/right sides of a tunnel
     * @param length How long the tunnel should be
     * @param xPosition How far apart the tunnel walls are
     */
    const generateTunnelCoordinates = (length: number, xPosition: number) => {
        const coords: [number, number, number][] = [];
        const startZ = -250;

        // Alternate between left and right walls
        for (let i = 0; i < length * 2; i++) {
            const x = i % 2 === 0 ? xPosition : -xPosition;
            const z = startZ - i * 8; // Space monsters along Z-axis
            coords.push([x, Yposition, z]);
        }

        return coords;
    };

    /**
     * Generates coordinates for diamond-type terrain
     * Creates a diamond-shaped pattern with inner and outer walls
     * @param size Diameter of the diamond formation
     * @param tunnelLength How far back the diamond extends
     */
    const generateDiamondCoordinates = (size: number, tunnelLength: number) => {
        const coords: [number, number, number][] = [];
        const wallEndOffset = -((segments / 2 - 2) * cubeSize);
        const tunnelEndOffset = tunnelLength * cubeSize * 0.6;

        // Outer diamond walls
        for (let i = 0; i < size; i++) {
            // Left outer wall
            const leftX = i === 0 ? -170 :
                i <= size / 2 ? -cubeSize * 3 - i * cubeSize :
                    (-cubeSize * 3 - size * cubeSize) + i * cubeSize;
            const leftZ = wallEndOffset - tunnelEndOffset - i * cubeSize * 0.5;
            coords.push([leftX, Yposition, leftZ]);

            // Right outer wall (mirror of left)
            const rightX = i === 0 ? 170 :
                i <= size / 2 ? cubeSize * 3 + i * cubeSize :
                    (cubeSize * 3 + size * cubeSize) - i * cubeSize;
            const rightZ = wallEndOffset - tunnelEndOffset - i * cubeSize * 0.5;
            coords.push([rightX, Yposition, rightZ]);
        }

        // Inner diamond walls (smaller pattern inside outer walls)
        const innerSize = Math.floor(size / 2) - 2;
        for (let i = 0; i < innerSize; i++) {
            // Left inner wall
            const innerLeftX = i === 1 ? (-cubeSize / 2) - i * cubeSize * 1.1 :
                i < innerSize / 2 ? (-cubeSize / 2) - i * cubeSize :
                    (-cubeSize / 2) - (innerSize * cubeSize) + i * cubeSize;
            const innerLeftZ = wallEndOffset - tunnelEndOffset - (Math.floor(size / 1.5) * cubeSize) - i * cubeSize * 0.7;
            coords.push([innerLeftX, Yposition, innerLeftZ]);

            // Right inner wall (mirror of left)
            const innerRightX = i === 1 ? (cubeSize / 2) + i * cubeSize * 1.1 :
                i < innerSize / 2 ? (cubeSize / 2) + i * cubeSize :
                    (cubeSize / 2) + (innerSize * cubeSize) - i * cubeSize;
            const innerRightZ = wallEndOffset - tunnelEndOffset - (Math.floor(size / 1.5) * cubeSize) - i * cubeSize * 0.7;
            coords.push([innerRightX, Yposition, innerRightZ]);
        }

        // Center block of diamond
        const middleZ = wallEndOffset - tunnelEndOffset - (Math.floor(size / 1.5) * cubeSize) + cubeSize;
        coords.push([0, Yposition, middleZ]);

        return coords;
    };

    /**
     * Initializes monster instances based on terrain coordinates
     * Creates clones of the monster model and sets up animations
     */
    const initialInstances = useMemo(() => {
        const instances: MonsterInstance[] = [];
        const terrainCoords = generateTerrainCoordinates(terrainType);
        originalCoordsRef.current = terrainCoords; // Store pattern for recycling

        terrainCoords.forEach((coord, index) => {
            const cloned = clone(monsterModel);
            let mixer: THREE.AnimationMixer | undefined;

            // Set up animations if provided
            if (monsterAnimations.length > 0) {
                mixer = new THREE.AnimationMixer(cloned);
                monsterAnimations.forEach(clip => {
                    const action = mixer!.clipAction(clip);
                    action.play();
                });
            }

            instances.push({
                position: coord,
                rotation: monsterRotation,
                scale: monsterScale,
                object: cloned,
                mixer,
                originalIndex: index // Remember which coordinate this monster uses
            });
        });

        return instances;
    }, [terrainType, monsterModel, monsterAnimations, monsterCount, Yposition, monsterScale, monsterRotation]);

    // Sync instances to ref
    useEffect(() => {
        instancesRef.current = initialInstances;
    }, [initialInstances]);

    // Track ship position each frame
    useFrame(() => {
        shipPositionRef.current = useStore.getState().playerPosition;
    });

    // Calculate diamond pattern length for recycling
    const diamondPatternLength = diamondSize * cubeSize * 1.3;

    /**
     * Main animation/recycling loop
     * Updates monster positions and recycles those that go behind the ship
     */
    useFrame((_, delta) => {
        const shipZ = shipPositionRef.current[2];
        const children = terrainRef.current?.children;

        if (!children) return;

        // Check for collisions with player
        if (!useStore.getState().gameOver) {
            const playerPos = useStore.getState().playerPosition;

            for (const monster of instancesRef.current) {
                const dx = monster.position[0] - playerPos[0];
                const dy = monster.position[1] - playerPos[1];
                const dz = monster.position[2] - playerPos[2];

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (distance < 15) {
                    useStore.getState().setGameOver(true);
                    console.log('Collision detected! Game over.');
                    break;
                }
            }
        }

        for (let i = 0; i < children.length; i++) {
            const monster = instancesRef.current[i];
            const mesh = children[i];

            if (!monster || !mesh) continue;

            // Update animation and position
            monster.mixer?.update(delta);
            mesh.position.set(...monster.position);
            mesh.rotation.set(...monster.rotation);
            mesh.scale.set(monster.scale, monster.scale, monster.scale);

            // Recycle monsters that pass behind the ship
            if (monster.position[2] > shipZ + 100) {
                const originalIndex = monster.originalIndex ?? 0;
                const originalCoord = originalCoordsRef.current[originalIndex];

                // Calculate how many pattern lengths we need to jump back
                const cycles = Math.floor((monster.position[2] - shipZ) / diamondPatternLength) + 1;
                const newZ = monster.position[2] - cycles * diamondPatternLength;

                // Reset position while maintaining pattern
                monster.position = [
                    originalCoord[0], // Keep original X position
                    originalCoord[1], // Keep original Y position
                    newZ              // Adjust Z to create seamless loop
                ];
            }
        }
    });

    return (
        <group ref={terrainRef} dispose={null}>
            {initialInstances.map((instance, index) => (
                <primitive
                    key={index}
                    object={instance.object}
                    position={instance.position}
                    rotation={instance.rotation}
                    scale={instance.scale}
                />
            ))}
        </group>
    );
};

export default MonsterTerrainGenerator;