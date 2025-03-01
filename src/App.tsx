import { Canvas } from '@react-three/fiber'
// import { OrbitControls, Loader } from '@react-three/drei';
import { Physics } from '@react-three/cannon';
import { Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Ship from './components/Ship';
import Cubes from './components/Cubes';

const App = () => (
    <>
        <Canvas>
            <ambientLight />
            {/* <OrbitControls /> */}
            <Skybox />

            <Physics>
                <Ground />
                <Ship />
                <Cubes />
            </Physics>
        </Canvas>
        <Loader />
    </>
)

export default App;