import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Ship from './components/Ship';
import MonsterTerrain from './components/MonsterTerrain';

/*
TODO: design different levels according to time
fixme: solve kid animation delay and ghost shadow
*/

const Game = () => {
    return (
        <>
            <Canvas>
                <ambientLight />
                <directionalLight
                    castShadow
                    position={[50, 100, 100]}
                    intensity={1.5}
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                <Skybox />

                <Physics>
                    <Ground />
                    <Ship />
                    <MonsterTerrain />
                </Physics>
            </Canvas>
            <Loader />
        </>
    )
}

export default Game; 