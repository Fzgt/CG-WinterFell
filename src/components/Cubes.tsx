import { cubeSize, cubeCount } from "../constants";
import { useBox } from "@react-three/cannon";
import * as THREE from 'three';
import { randomInRange } from "../utils";

const Cubes = () => {

    const [boxRef] = useBox<THREE.InstancedMesh>(() => ({
        position: [randomInRange(-400, 400), 10, randomInRange(200, 1000)],
    }))

    return (
        <instancedMesh ref={boxRef} args={[undefined, undefined, cubeCount]}>
            <boxGeometry args={[cubeSize, cubeSize, cubeSize]} />
            <meshBasicMaterial color={0xff2190} />
        </instancedMesh>
    )
}



export default Cubes;