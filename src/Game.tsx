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
import SoundTrack from './components/SoundTrack';
import { CANDY_CORN_CONFIG, GHOST_CONFIG, TREASURE_CHEST_CONFIG, MINI_CANDY_CONFIG, BOTTLE_CONFIG} from './config/collectibles';
import { benchFlags } from './utils/bench';
import PerfProbe from './utils/PerfProbe';


interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
    const webGPUAvailable = useWebGPUSupport();
    // ?renderer=webgl forces the fallback path so the two renderers can be
    // benchmarked against the same scene.
    const isWebGPUSupported = webGPUAvailable && !benchFlags.forceWebGL;
    const gameOver = useStore(state => state.gameOver);
    const runId = useStore(state => state.runId);

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
                {benchFlags.perf && <PerfProbe />}
                {/* Distance fog in the sky's own colour. Sections used to pop
                    into view at the far plane with nothing to soften them;
                    now the trail fades out ahead, which both hides the seam
                    and gives the night some depth. */}
                <fog attach="fog" args={['#1b1830', 260, 900]} />
                <ambientLight intensity={0.55} color="#93a7ff" />
                <directionalLight
                    castShadow
                    position={[50, 100, 100]}
                    intensity={2.4}
                    color="#dfe7ff"
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                {/* A warm bounce from the pumpkins, so the ground is not lit
                    purely by cold moonlight. */}
                <hemisphereLight
                    args={['#ffb066', '#241a2e', 0.5]}
                    position={[0, 40, 0]}
                />
                <Skybox />

                <Physics key={runId}>
                    <Ground />
                    <GrassField />
                    {onStart && <Player />}
                    <PumpkinField />
                    <CollectibleField config={CANDY_CORN_CONFIG} />
                    <CollectibleField config={TREASURE_CHEST_CONFIG} />
                    <CollectibleField config={GHOST_CONFIG} />
                    <CollectibleField config={MINI_CANDY_CONFIG} />
                    <CollectibleField config={BOTTLE_CONFIG} />
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