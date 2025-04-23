import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import PumpkinField from './components/PumpkinField';
import Score from './components/Score';
import Pause from './components/Pause';
import { useWebGPUSupport } from './hooks/useWebGPURenderer';
import WebgpuSupport from './components/WebgpuSupport';

interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
    const isWebGPUSupported = useWebGPUSupport();

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
                    {onStart && <Player />}
                    <PumpkinField />
                </Physics>
            </Canvas>
            <Loader />
            {onStart && <Score />}
            <Pause />
            {isWebGPUSupported && <WebgpuSupport />}
        </>
    );
};

export default Game;
