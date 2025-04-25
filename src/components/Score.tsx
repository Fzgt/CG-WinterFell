import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import '../styles/score.css';
import { updateHighScores } from '../utils/utils';

const Score = () => {
    const score = useStore(state => state.score);
    const addScore = useStore(state => state.addScore);
    const gameOver = useStore(state => state.gameOver);
    const [highScores, setHighScores] = useState<number[]>([]);
    const playerSpeed = useStore(state => state.playerSpeed);

    useEffect(() => {
        if (gameOver) {
            const topScores = updateHighScores(score);
            setHighScores(topScores);
        }
    }, [gameOver]);

    useEffect(() => {
        if (gameOver) return;

        const timer = setInterval(() => {
            addScore(3);
        }, 200);

        return () => clearInterval(timer);
    }, [gameOver]);

    const handlePlayAgain = () => {
        window.location.reload();
    };

    return (
        <div className="score-display">
            <div className={`score-value ${gameOver ? 'game-over' : ''}`}>
                {gameOver ? (
                    <div className="game-over-container">
                        <div className="game-over-text">
                            <span className="animated-letter">G</span>
                            <span className="animated-letter">a</span>
                            <span className="animated-letter">m</span>
                            <span className="animated-letter">e</span>
                            <span className="animated-letter">&nbsp;</span>
                            <span className="animated-letter">O</span>
                            <span className="animated-letter">v</span>
                            <span className="animated-letter">e</span>
                            <span className="animated-letter">r</span>
                            <span className="animated-letter">!</span>
                        </div>
                        <div className="final-score">Score: {score.toLocaleString()}</div>

                        <div className="high-scores-container">
                            <h3 className="high-scores-title">Best Scores</h3>
                            <div className="high-scores-list">
                                {highScores.map((highScore, index) => (
                                    <div key={index} className="high-score-item">
                                        <span className="high-score-rank">{index + 1}</span>
                                        <span className="high-score-value">
                                            {highScore.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                                {highScores.length === 0 && (
                                    <div className="no-scores">No records yet</div>
                                )}
                            </div>
                        </div>

                        <button className="restart-button" onClick={handlePlayAgain}>
                            Play Again
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ paddingBottom: '10px' }}>
                            Speed: {playerSpeed.toLocaleString() + ' m/s'}
                        </div>
                        <div>Score: {score.toLocaleString()}</div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Score;
