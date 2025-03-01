import { useAnimations, useGLTF } from "@react-three/drei"
import { Suspense, useRef, useEffect } from "react"
import * as THREE from 'three'


const ShipModel = () => {
    const group = useRef<THREE.Group>(null)

    const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
    const { actions, names } = useAnimations(animations, group)
    useEffect(() => {
        actions[names[0]]?.play();
    })

    return (
        <group ref={group}>
            <primitive
                object={scene}
                scale={[5, 5, 5]}
            />
        </group>
    )
}

const Ship = () => {
    return (
        <>
            <Suspense fallback={null}>
                <ShipModel />
            </Suspense>
        </>
    )
}

export default Ship;