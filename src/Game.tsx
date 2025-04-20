import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import MonsterTerrain from './components/MonsterTerrain';
import Score from './components/Score';

interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
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
                    <Player />
                    <MonsterTerrain />
                </Physics>

            </Canvas>
            <Loader />
            {onStart && <Score />}
        </>
    )
}

export default Game; 