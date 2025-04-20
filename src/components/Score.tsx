import { useEffect } from 'react';
import { useStore } from '../store';
import '../styles/ScoreDisplay.css';

const ScoreDisplay = () => {
    const score = useStore(state => state.score);
    const addScore = useStore(state => state.addScore);

    useEffect(() => {
        const timer = setInterval(() => {
            addScore(3);
        }, 200);

        return () => clearInterval(timer);
    }, [addScore]);

    return (
        <div className="score-display">
            <div className="score-value">
                score: {score.toLocaleString()}
            </div>
        </div>
    );
};

export default ScoreDisplay; 