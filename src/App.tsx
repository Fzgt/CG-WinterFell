import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei';
import Skybox from './components/Skybox';

const App = () => <Canvas>
    <ambientLight />
    <OrbitControls />
    <Skybox />
</Canvas>

export default App;