import { useAnimations, useGLTF, PerspectiveCamera, } from "@react-three/drei"
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import { useBox } from "@react-three/cannon"
import * as THREE from 'three'
import { useFrame } from "@react-three/fiber"
import { useStore } from "../store"
import useKeyboardControls from "../hooks/useKeyboardControls"
import gsap from "gsap"

interface ShipModelRef {
    shipModel: React.RefObject<THREE.Group>
}

const ShipModel = forwardRef<ShipModelRef>((_props, ref) => {

    const { shipPosition, moveShip } = useStore();
    const shipRef = useRef<THREE.Mesh>(null);
    const [groupRef, _api] = useBox<THREE.Group>(() => ({
        position: shipPosition,
        mass: 0,
        args: [10, 10, 10]
    }), useRef(null), [shipPosition]);

    // const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
    const { scene, animations } = useGLTF('/models/jo_on_bike__rigged__animated/scene.gltf')
    const { actions, names } = useAnimations(animations, groupRef)

    useEffect(() => {
        actions[names[0]]?.play();
    }, []);

    const { left, right } = useKeyboardControls();

    useEffect(() => {
        gsap.to(shipRef.current!.rotation, {
            z: (left || right) ? (left ? -Math.PI : Math.PI) / 6 : 0,
        })
    }, [left, right]);

    useImperativeHandle(ref, () => ({
        shipModel: groupRef
    }))



    useFrame(() => {
        let x = (left || right) ? (left ? -1 : 1) : 0;
        moveShip([x, 0, 0]);
        const shipPosition = groupRef.current!.position;
        console.log(shipPosition)
    })

    return (
        <group ref={groupRef} scale={2}>
            <primitive
                ref={shipRef}
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