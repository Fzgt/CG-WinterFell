import { Canvas } from '@react-three/fiber'
import { OrbitControls, Loader } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';
import Ship from './components/Ship';

const App = () => (
    <>
        <Canvas>
            <ambientLight />
            {/* <OrbitControls /> */}
            <Skybox />

            <Ground />
            <Ship />
        </Canvas>
        <Loader />
    </>
)

export default App;