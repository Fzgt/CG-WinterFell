import { useAnimations, useGLTF, PerspectiveCamera, } from "@react-three/drei"
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import * as THREE from 'three'
import { useFrame } from "@react-three/fiber"
import { shipSpeed } from "../constants"

interface ShipModelRef {
    shipModel: React.RefObject<THREE.Group>
}

const ShipModel = forwardRef<ShipModelRef>(

    (_props, ref) => {
        const groupRef = useRef<THREE.Group>(null)

        const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
        const { actions, names } = useAnimations(animations, groupRef)
        useEffect(() => {
            actions[names[0]]?.play();
        }, []);

        useImperativeHandle(ref, () => ({
            shipModel: groupRef
        }))

        useFrame(() => {
            groupRef.current?.position.set(0, 3, groupRef.current!.position.z - shipSpeed);
        })

        return (
            <group ref={groupRef} scale={2} position={[0, 1, -20]}>
                <primitive
                    object={scene}
                    rotation={[0, Math.PI, 0]}
                />
            </group>
        )
    }
)

const Ship = () => {
    const camera = useRef<THREE.PerspectiveCamera>(null)
    const ShipModelRef = useRef<ShipModelRef>(null)

    useFrame(() => {
        if (!ShipModelRef) return;
        if (!camera) return;

        const position = ShipModelRef.current?.shipModel.current?.position;
        if (position) {
            const { x, y, z } = position;
            camera.current!.position.set(x, y + 4, z + 10);
        }
    })

    return (
        <>
            <PerspectiveCamera
                ref={camera}
                makeDefault
                fov={75}
                near={0.1}
                far={1200} />
            <Suspense fallback={null}>
                <ShipModel ref={ShipModelRef} />
            </Suspense>
        </>
    )
}

export default Ship;