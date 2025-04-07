import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import { randomInRange } from '../utils';
import { cubeCount } from '../constants';

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
    _path: string
    Yposition: number;
    rotation?: [number, number, number];
    scale?: number;
}

const Monsters = ({
    _path,
    Yposition,
    rotation = [0, 0, 0],
    scale = 0.05 }: Props
) => {
    const { scene } = useGLTF(_path) as unknown as GLTFResult;
    const [instances, setInstances] = useState<MonsterInstance[]>([]);

    useEffect(() => {
        const newInstances: MonsterInstance[] = Array.from({ length: cubeCount }, () => ({
            position: [randomInRange(-500, 500), Yposition, randomInRange(200, 2000)],
            rotation,
            scale,
        }));
        setInstances(newInstances);
    }, []);

    return (
        <group dispose={null}>
            {instances.map((props, index) => (
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
