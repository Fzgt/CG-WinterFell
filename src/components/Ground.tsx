import { useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";
import * as THREE from 'three';
import { usePlane, Triplet } from "@react-three/cannon";
import { planeSize, planeTextureSize } from "../constants";

interface PlaneProps {
    position: Triplet;
}


const Plane = ({ position }: PlaneProps) => {

    const texture = useTexture('/textures/tile.jpg');
    useLayoutEffect(() => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(planeTextureSize, planeTextureSize);
        texture.anisotropy = 16;
    }, [texture])

    const [planeRef, _api] = usePlane<THREE.Mesh>(() => ({
        rotation: [-Math.PI / 2, 0, 0],
        position,
        mass: 0,
    }))

    return (
        <mesh
            ref={planeRef}
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
    )
}


const Ground = () => {
    return (
        <>
            <Plane position={[0, 0, -planeSize / 2]} />
            <Plane position={[0, 0, -planeSize - planeSize / 2]} />
        </>
    )

}

export default Ground;