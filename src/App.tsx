import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber'
import WelcomePage from './components/WelcomePage';
import { ResourcePreloader } from './utils/ResourcePreloader';
import ProgressMonitor from './components/ProgressMonitor';
import Game from './Game';
import './styles/layout.css';

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