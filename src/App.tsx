import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber'
// import { OrbitControls, Loader } from '@react-three/drei';
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Ship from './components/Ship';
import { useGLTF } from '@react-three/drei';
import MonsterTerrainGenerator from './components/TerrainGenerator';
import WelcomePage from './components/WelcomePage';
import { ResourcePreloader } from './utils/ResourcePreloader';
import ProgressMonitor from './components/ProgressMonitor';
import './styles/layout.css';

/*
TODO: design different levels according to time
fixme: solve kid animation delay and ghost shadow
*/

const Game = () => {

    const { scene: pumpkin_1 } = useGLTF('/models/monsters/halloween_pumpkin_2.glb') as any;
    const { scene: pumpkin_2 } = useGLTF('/models/monsters/halloween_pumpkin.glb') as any;

    return (
        <>
            <Canvas>
                <ambientLight />
                {/* Directional light (simulates sun, casts shadows) */}
                <directionalLight
                    castShadow
                    position={[50, 100, 100]}
                    intensity={1.5}
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                {/* <OrbitControls /> */}
                <Skybox />

                <Physics>
                    <Ground />
                    <Ship />
                    <MonsterTerrainGenerator
                        terrainType="tunnel"
                        monsterCount={300}
                        monsterModel={pumpkin_2}
                        Yposition={9}
                        tunnelLength={50}
                        monsterScale={9}
                        monsterRotation={[0, -Math.PI / 2, 0]}
                    />
                    <MonsterTerrainGenerator
                        terrainType="tunnel"
                        monsterCount={300}
                        monsterModel={pumpkin_2}
                        Yposition={9}
                        tunnelLength={50}
                        monsterScale={9}
                        xPosition={450}
                    />
                    <MonsterTerrainGenerator
                        terrainType="diamond"
                        monsterModel={pumpkin_1}
                        Yposition={0.5}
                        tunnelLength={1}
                        diamondSize={20}
                        monsterScale={0.1}
                    />
                    <MonsterTerrainGenerator
                        terrainType="wall"
                        monsterModel={pumpkin_1}
                        Yposition={0.5}
                        tunnelLength={10}
                        diamondSize={20}
                        monsterScale={0.1}
                    />

                </Physics>
            </Canvas>
            <Loader />
        </>
    )
}

const App = () => {
    const [showWelcome, setShowWelcome] = useState(true);
    const [staticLoaded, setStaticLoaded] = useState(false);

    return (
        <>
            <div className="progress-monitor-container">
                <Canvas>
                    <Suspense fallback={null}>
                        <ResourcePreloader />
                        <ProgressMonitor onProgress={setStaticLoaded} />
                    </Suspense>
                </Canvas>
            </div>

            <div className="app-container">
                {showWelcome && (
                    <WelcomePage onStart={() => setShowWelcome(false)} />
                )}

                <div className={`game-container`}>
                    {staticLoaded && <Game />}
                </div>
            </div>
        </>
    );
};

export default App;