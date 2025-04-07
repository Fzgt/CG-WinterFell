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
                    Yposition={2}
                />
                <Monsters
                    _path='/models/monsters/halloween_pumpkin.glb'
                    rotation={[0, 0, 0]}
                    scale={10}
                    Yposition={9}
                />
            </Physics>
        </Canvas>
        <Loader />
    </>
)

export default App;