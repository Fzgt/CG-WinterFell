import { useStore } from '../store/store';
import '../styles/pause.css';

const Pause = () => {
    const gamePaused = useStore((state) => state.gamePaused);

    if (!gamePaused) return null;

    return (
        <div className="pause-overlay">
            <div className="pause-content">
                <h2>GAME PAUSED</h2>
                <p>Press SPACE to continue</p>
            </div>
        </div>
    );
};

export default Pause; 