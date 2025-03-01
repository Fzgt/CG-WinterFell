import { planeSize } from "../constants";
import { useTexture } from "@react-three/drei";

const Ground = () => {
    const texture = useTexture('/textures/grid-pink.png');

    return (
        <>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
            >
                <planeGeometry args={[planeSize, planeSize]} />
                <meshStandardMaterial
                    emissive={0xffffff}
                    roughness={0}
                    metalness={0}
                    emissiveMap={texture}
                    map={texture}
                />
            </mesh>
        </>
    )
}

export default Ground;