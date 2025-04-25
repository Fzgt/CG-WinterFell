import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Player from './components/Player';
import PumpkinField from './components/PumpkinField';
import Score from './components/Score';
import Pause from './utils/Pause';
import { useWebGPUSupport } from './hooks/useWebGPURenderer';
import WebgpuSupport from './utils/WebgpuSupport';
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
// import { Suspense, lazy } from 'react';
// import { isDev } from './utils/utils';

// const LazyDebugComponent = lazy(() => import('./utils/Debug'));

interface GameProps {
    onStart: boolean;
}

const Game = ({ onStart }: GameProps) => {
    const isWebGPUSupported = useWebGPUSupport();

    return (
        <>
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
                    {onStart && <Player />}
                    <PumpkinField />

                    {/* {isDev && <Suspense fallback={null}>{<LazyDebugComponent />}</Suspense>} */}
                </Physics>
            </Canvas>
            <Pause />
            {onStart && <Score />}
            {isWebGPUSupported && <WebgpuSupport />}
        </>
    );
};

export default Game;
