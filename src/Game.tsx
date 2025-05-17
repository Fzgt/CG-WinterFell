import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import PumpkinField from './components/PumpkinField';
import CollectibleField from './components/CollectibleField';
import Score from './components/Score';
import FloatingScoreManager from './components/FloatingScoreManager';
import Pause from './utils/Pause';
import { useWebGPUSupport } from './hooks/useWebGPURenderer';
import WebgpuSupport from './utils/WebgpuSupport';
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import GrassField from './components/GrassField';
import { WebGPURenderer } from 'three/webgpu';
import { useStore } from './store/store';
import { CANDY_CORN_CONFIG, GHOST_CONFIG, TREASURE_CHEST_CONFIG} from './config/collectibles';
import SoundTrack from './components/SoundTrack';


interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
    const isWebGPUSupported = useWebGPUSupport();
    const gameOver = useStore(state => state.gameOver);

    return (
        <>
            <SoundTrack onStart={onStart} />
            <Canvas
                gl={async props => {
                    if (isWebGPUSupported) {
                        const renderer = new WebGPURenderer(props as any);
                        await renderer.init();
                        return renderer;
                    } else {
                        const renderer = new WebGLRenderer({
                            antialias: true,
                            alpha: true,
                            powerPreference: 'high-performance',
                        });
                        renderer.toneMapping = ACESFilmicToneMapping;
                        renderer.outputColorSpace = SRGBColorSpace;
                        return renderer;
                    }
                }}
            >
                <ambientLight intensity={0.8} />
                <directionalLight
                    castShadow
                    position={[50, 100, 100]}
                    intensity={3.0}
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                <Skybox />

                <Physics>
                    <Ground />
                    <GrassField />
                    {onStart && <Player />}
                    <PumpkinField />
                    <CollectibleField config={CANDY_CORN_CONFIG} />
                    <CollectibleField config={TREASURE_CHEST_CONFIG} />
                    <CollectibleField config={GHOST_CONFIG} />
                    {onStart && <FloatingScoreManager />}
                </Physics>
            </Canvas>
            {onStart && <Score />}
            {onStart && !gameOver && <Pause />}
            {onStart && isWebGPUSupported && <WebgpuSupport />}
        </>
    );
};

export default Game;