import { useAnimations, useGLTF, PerspectiveCamera, } from "@react-three/drei"
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import { useBox } from "@react-three/cannon"
import * as THREE from 'three'
import { useFrame } from "@react-three/fiber"
import { useStore } from "../store"

interface ShipModelRef {
    shipModel: React.RefObject<THREE.Group>
}

const ShipModel = forwardRef<ShipModelRef>((_props, ref) => {

    const { shipPosition, moveShip } = useStore();
    const [groupRef, _api] = useBox<THREE.Group>(() => ({
        position: shipPosition,
        mass: 0,
    }), useRef(null), [shipPosition]);

    const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
    const { actions, names } = useAnimations(animations, groupRef)
    useEffect(() => {
        actions[names[0]]?.play();
    }, []);

    useImperativeHandle(ref, () => ({
        shipModel: groupRef
    }))

    useFrame(() => {
        moveShip();
    })

    return (
        <group ref={groupRef} scale={2}>
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
    const shipPosition = useStore(state => state.shipPosition);

    useEffect(() => {
        if (!camera.current) return;
        const [x, y, z] = shipPosition;
        camera.current!.position.set(x, y + 4, z + 10);

    }, [shipPosition])

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