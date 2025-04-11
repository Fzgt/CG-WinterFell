import { Canvas } from '@react-three/fiber'
// import { OrbitControls, Loader } from '@react-three/drei';
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Ship from './components/Ship';
import Monsters from './components/Monsters';

const App = () => (
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
                <Monsters
                    _path='/models/monsters/halloween_pumpkin_2.glb'
                    rotation={[0, 0, 0]}
                    scale={0.07}
                    Yposition={0}
                />
                <Monsters
                    _path='/models/monsters/halloween_pumpkin.glb'
                    rotation={[0, 0, 0]}
                    scale={10}
                    Yposition={8}
                />
                <Monsters
                    _path='/models/monsters/emerald_bat.glb'
                    rotation={[0, 0, 0]}
                    scale={0.4}
                    Yposition={28}
                />
                <Monsters
                    _path='/models/monsters/glow_bat.glb'
                    rotation={[0, 0, 0]}
                    scale={0.3}
                    Yposition={33}
                />
                <Monsters
                    _path='/models/monsters/king_boo.glb'
                    rotation={[0, 0, 0]}
                    scale={0.03}
                    Yposition={10}
                />
            </Physics>
        </Canvas>
        <Loader />
    </>
)

export default App;