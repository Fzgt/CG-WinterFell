import { useAnimations, useGLTF, PerspectiveCamera, } from "@react-three/drei"
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import * as THREE from 'three'
import { useFrame } from "@react-three/fiber"

interface ShipModelRef {
    shipModel: React.RefObject<THREE.Group>
}

const ShipModel = forwardRef<ShipModelRef>(
    (props, ref) => {
        const group = useRef<THREE.Group>(null)

        const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
        const { actions, names } = useAnimations(animations, group)
        useEffect(() => {
            actions[names[0]]?.play();
        }, []);

        useImperativeHandle(ref, () => ({
            shipModel: group
        }))

        return (
            <group ref={group} scale={2} position={[0, 1, 0]}>
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