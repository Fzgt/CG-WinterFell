import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei';
import Skybox from './components/Skybox';
import Ground from './components/Ground';

const App = () => <Canvas>
    <ambientLight />
    <OrbitControls />
    <Skybox />

    <Ground />
</Canvas>

export default App;