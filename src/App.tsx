import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import WelcomePage from './components/WelcomePage';
import { ResourcePreloader } from './utils/ResourcePreloader';
import ProgressMonitor from './components/ProgressMonitor';
import Game from './Game';
import './styles/layout.css';
import { useStore } from './store/store';

const App = () => {
    const [showWelcome, setShowWelcome] = useState(true);
    const [staticLoaded, setStaticLoaded] = useState(false);
    const setGameStarted = useStore(state => state.setGameStarted);
    const setScenic = useStore(state => state.setScenic);

    const handleStartGame = () => {
        // DEV ONLY: scenic mode (no obstacles, no crashes) is kept for
        // reviewing the scenes, but off the menu — ?scenic=1 turns it on,
        // pairs with ?z= for jumping down the route. Strip both with the
        // rest of the dev tools before pushing.
        setScenic(new URLSearchParams(location.search).has('scenic'));
        setShowWelcome(false);
        setGameStarted(true);
    };

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
                {showWelcome && <WelcomePage onStart={handleStartGame} />}
                <div className="game-container">
                    {staticLoaded && <Game onStart={!showWelcome} />}
                </div>
            </div>
        </>
    );
};

export default App;
