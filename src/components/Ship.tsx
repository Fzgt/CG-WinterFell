import { useAnimations, useGLTF, PerspectiveCamera, } from "@react-three/drei"
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef, useState } from "react"
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
        args: [10, 5, 10]
    }), useRef(null), [shipPosition]);

    const { scene, animations } = useGLTF('/models/bull_dog/scene.gltf')
    const { actions, names } = useAnimations(animations, groupRef)
    useEffect(() => {
        actions[names[0]]?.play();
    }, []);

    useImperativeHandle(ref, () => ({
        shipModel: groupRef
    }))

    const [left, setLeft] = useState(false);
    const [right, setRight] = useState(false);

    useEffect(() => {
        const eventHandler = ({ key }: KeyboardEvent, isDown: boolean) => {
            (key === 'a' || key === 'ArrowLeft') && setLeft(isDown);
            (key === 'd' || key === 'ArrowRight') && setRight(isDown);
        }

        const upEvent = (e: KeyboardEvent) => eventHandler(e, false);
        const downEvent = (e: KeyboardEvent) => eventHandler(e, true);

        window.addEventListener('keydown', downEvent);
        window.addEventListener('keyup', upEvent);

        return () => {
            window.removeEventListener('keyup', upEvent);
            window.removeEventListener('keydown', downEvent);
        }
    }, [])


    useFrame(() => {
        let x = (left || right) ? (left ? -1 : 1) : 0;
        moveShip([x, 0, 0]);
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