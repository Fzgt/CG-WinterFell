import { cubeSize, cubeCount } from "../constants";
import { useBox, Triplet } from "@react-three/cannon";
import * as THREE from 'three';
import { randomInRange } from "../utils";

const Cubes = () => {

    const boxSize: Triplet = [cubeSize, cubeSize, cubeSize];

    const [boxRef] = useBox<THREE.InstancedMesh>(() => ({
        position: [randomInRange(-500, 500), 10, randomInRange(200, 2000)],
        mass: 1,
        args: boxSize
    }))

    return (
        <instancedMesh ref={boxRef} args={[undefined, undefined, cubeCount]}>
            <boxGeometry args={boxSize} />
            <meshBasicMaterial color={0xff2190} />
        </instancedMesh>
    )
}



export default Cubes;