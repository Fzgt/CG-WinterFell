import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { randomInRange } from '../utils';
import { cubeCount } from '../constants';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';

/**
 * @CoreLogic
 * useMemo to initiaze and reuse monsters and stored in instancesRef
 * Reuse monsters once they are behind the ship.
 * Rendering optimization: use THREE.group to contain/traverse all monsters to avoid unnecessary state change
*/

type GLTFResult = {
    scene: THREE.Group;
    nodes: Record<string, THREE.Object3D>;
    materials: Record<string, THREE.Material>;
};

type MonsterInstance = {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
};

interface Props {
    _path: string;
    Yposition: number;
    rotation?: [number, number, number];
    scale?: number;
}

const Monsters = ({
    _path,
    Yposition,
    rotation = [0, 0, 0],
    scale = 0.05
}: Props) => {
    const { scene } = useGLTF(_path) as unknown as GLTFResult;
    const instancesRef = useRef<MonsterInstance[]>([]);
    const groupRef = useRef<THREE.Group>(null);
    const shipPositionRef = useRef([0, 0, 0]);

    // initialize & cache monster instances with useMemo
    const initialInstances = useMemo<MonsterInstance[]>(() => {
        return Array.from({ length: cubeCount }, (): MonsterInstance => ({
            position: [
                randomInRange(-500, 500),
                Yposition,
                randomInRange(200, 2000)
            ] as [number, number, number],
            rotation,
            scale
        }));
    }, [Yposition, rotation, scale]);

    // useEffect to initialize instances
    useEffect(() => {
        instancesRef.current = initialInstances;
    }, [initialInstances]);

    // subscribe to ship z positon (optimization)
    useFrame(() => {
        const shipPosition = useStore.getState().shipPosition;
        shipPositionRef.current = shipPosition;
    });

    // main frame loop update
    useFrame(() => {
        if (!groupRef.current) return;

        const shipZ = shipPositionRef.current[2];
        const children = groupRef.current.children;

        for (let i = 0; i < children.length; i++) {
            const monster = instancesRef.current[i];
            const monsterMesh = children[i];

            // update monster position (directly change three.js object, avoid state update)
            monsterMesh.position.set(
                monster.position[0],
                monster.position[1],
                monster.position[2]
            );

            // check position relative to the ship to recycle monsters, realizing infinite generation
            if (monster.position[2] > shipZ + 200) {
                monster.position = [
                    randomInRange(-500, 500),
                    Yposition,
                    shipZ + randomInRange(1000, 2000)
                ];
                instancesRef.current = [...instancesRef.current];
            }
        }
    });

    return (
        <group ref={groupRef} dispose={null}>
            {initialInstances.map((props, index) => (
                <primitive
                    key={index}
                    object={scene.clone(true)}
                    position={props.position}
                    rotation={props.rotation}
                    scale={props.scale}
                />
            ))}
        </group>
    );
};

export default Monsters;