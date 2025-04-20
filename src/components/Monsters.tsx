import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { randomInRange } from '../utils';
import { cubeCount } from '../constants';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * @CoreLogic
 * useMemo to initialize and reuse monsters and store in instancesRef
 * Reuse monsters once they are behind the ship.
 * Add animation playback using AnimationMixer.
*/

type GLTFResult = {
    scene: THREE.Group;
    nodes: Record<string, THREE.Object3D>;
    materials: Record<string, THREE.Material>;
    animations: THREE.AnimationClip[];
};

type MonsterInstance = {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
    object: THREE.Object3D;
    mixer?: THREE.AnimationMixer;
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
    const { scene, animations } = useGLTF(_path) as unknown as GLTFResult;
    const instancesRef = useRef<MonsterInstance[]>([]);
    const groupRef = useRef<THREE.Group>(null);
    const shipPositionRef = useRef([0, 0, 0]);

    // initialize & cache monster instances with useMemo
    const initialInstances = useMemo<MonsterInstance[]>(() => {
        return Array.from({ length: cubeCount }, () => {
            //play animation for animated models
            const cloned = clone(scene);
            let mixer: THREE.AnimationMixer | undefined;

            if (animations.length > 0) {
                mixer = new THREE.AnimationMixer(cloned);
                animations.forEach(clip => {
                    const action = mixer!.clipAction(clip);
                    action.play();
                });
            }

            return {
                position: [
                    randomInRange(-500, 500),
                    Yposition,
                    randomInRange(200, 600)
                ] as [number, number, number],
                rotation,
                scale,
                object: cloned,
                mixer
            };
        });
    }, [scene, animations, Yposition, rotation, scale]);

    useEffect(() => {
        instancesRef.current = initialInstances;
    }, [initialInstances]);

    useFrame(() => {
        shipPositionRef.current = useStore.getState().playerPosition;
    });

    // frame update: move monsters + update animations
    useFrame((_, delta) => {
        const shipZ = shipPositionRef.current[2];
        const children = groupRef.current?.children;

        if (!children) return;

        for (let i = 0; i < children.length; i++) {
            const monster = instancesRef.current[i];
            const mesh = children[i];

            if (!monster || !mesh) continue;

            // update animation
            monster.mixer?.update(delta);

            // update position
            mesh.position.set(...monster.position);

            // recycle when out of view
            if (monster.position[2] > shipZ + 100) {
                monster.position = [
                    randomInRange(-500, 500),
                    Yposition,
                    shipZ + randomInRange(200, 600)
                ];
            }
        }
    });

    return (
        <group ref={groupRef} dispose={null}>
            {initialInstances.map((monster, index) => (
                <primitive
                    key={index}
                    object={monster.object}
                    position={monster.position}
                    rotation={monster.rotation}
                    scale={monster.scale}
                />
            ))}
        </group>
    );
};

export default Monsters;
