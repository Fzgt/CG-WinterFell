import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import WelcomePage from './components/WelcomePage';
import { ResourcePreloader } from './utils/ResourcePreloader';
import ProgressMonitor from './components/ProgressMonitor';
import Game from './Game';
import './styles/layout.css';
import { useStore } from './store/store';
// import { AudioPreloader } from './components/AudioPreloader';

const App = () => {
    const [showWelcome, setShowWelcome] = useState(true);
    const [staticLoaded, setStaticLoaded] = useState(false);
    const setGameStarted = useStore(state => state.setGameStarted);

    const handleStartGame = () => {
        setShowWelcome(false);
        setGameStarted(true);
    };

    return (
        <>
            <div className="progress-monitor-container">
                <Canvas>
                    <Suspense fallback={null}>
                        {/* <AudioPreloader /> */}
                        <ResourcePreloader />
                        <ProgressMonitor onProgress={setStaticLoaded} />
                    </Suspense>
                </Canvas>
            </div>

            <div className="app-container">
                {showWelcome && <WelcomePage onStart={handleStartGame} />}
                <div className="game-container">
                    {staticLoaded && <Game onStart={!showWelcome} />}
                </div>
            </div>
        </>
    );
};

export default App;
