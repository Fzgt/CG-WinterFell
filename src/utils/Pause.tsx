import { useStore } from '../store/store';
import '../styles/pause.css';

const Pause = () => {
    const gamePaused = useStore(state => state.gamePaused);

    if (!gamePaused) return null;

    return (
        <div className="pause-overlay">
            <div className="pause-content">
                <h2>Paused</h2>
                <p>
                    <span className="key">Space</span> to continue
                </p>
            </div>
        </div>
    );
};

export default Pause;
