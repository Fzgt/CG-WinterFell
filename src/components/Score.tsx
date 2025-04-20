import { useEffect } from 'react';
import { useStore } from '../store';
import '../styles/score.css';

const Score = () => {
    const score = useStore(state => state.score);
    const addScore = useStore(state => state.addScore);
    const gameOver = useStore(state => state.gameOver);

    useEffect(() => {
        if (gameOver) return;
        
        const timer = setInterval(() => {
            addScore(3);
        }, 200);

        return () => clearInterval(timer);
    }, [addScore, gameOver]);

    return (
        <div className="score-display">
            <div className="score-value">
                {gameOver ? (
                    <span className="game-over-text">Game Over! Score: {score.toLocaleString()}</span>
                ) : (
                    <>score: {score.toLocaleString()}</>
                )}
            </div>
        </div>
    );
};

export default Score; 