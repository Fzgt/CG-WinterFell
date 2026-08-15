import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import ObstacleField from './components/ObstacleField';
import LevelDirector from './components/LevelDirector';
import Score from './components/Score';
import Pause from './utils/Pause';
import { useWebGPUSupport } from './hooks/useWebGPURenderer';
import { ACESFilmicToneMapping } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { useStore } from './store/store';
import { benchFlags } from './utils/bench';
import { paletteFor } from './config/levels';
import PerfProbe from './utils/PerfProbe';
import PostFX from './components/PostFX';
import Warmup from './components/Warmup';
import Scenery from './components/Scenery';
import SectorBanner from './components/SectorBanner';


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
    const level = useStore(state => state.level);
    const scenic = useStore(state => state.scenic);
    const palette = paletteFor(level);

    return (
        <>
            <Canvas
                gl={async props => {
                    // One renderer for both backends. WebGPURenderer drives
                    // WebGPU where it exists and its own WebGL2 backend where
                    // it doesn't, which matters here because the bloom pass
                    // (see PostFX) is built from three's node pipeline: a
                    // plain WebGLRenderer could not run it, and the fallback
                    // would silently lose the glow the whole look rests on.
                    const renderer = new WebGPURenderer({
                        ...(props as object),
                        antialias: true,
                        forceWebGL: !isWebGPUSupported,
                    } as never);
                    renderer.toneMapping = ACESFilmicToneMapping;
                    await renderer.init();
                    return renderer;
                }}
            >
                {benchFlags.perf && <PerfProbe />}
                <PostFX />
                <Warmup />
                {/* Distance fog in the sky's own colour. Sections used to pop
                    into view at the far plane with nothing to soften them;
                    now the trail fades out ahead, which both hides the seam
                    and gives the night some depth. */}
                <fog attach="fog" args={[palette.fog, 300, 1000]} />
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
                    <Scenery />
                    {onStart && <Player />}
                    {onStart && <LevelDirector />}
                    <ObstacleField />
                </Physics>
            </Canvas>
            {/* DEV ONLY: scenic badge. */}
            {onStart && scenic && <div className="scenic-badge">SCENIC</div>}
            {onStart && <Score />}
            {onStart && <SectorBanner />}
            {onStart && !gameOver && <Pause />}
        </>
    );
};

export default Game;