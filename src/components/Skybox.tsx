import * as THREE from 'three';
import { useTexture } from '@react-three/drei'


const Skybox = () => {
    const galaxyTexture = useTexture('/textures/galaxy.jpg')

    return (
        <mesh>
            <sphereGeometry args={[800, 32, 32]} />
            <meshPhongMaterial
                emissive={0xff2190}
                side={THREE.BackSide}
                emissiveIntensity={0.1}
                map={galaxyTexture}
            />
        </mesh>
    )
}


export default Skybox;