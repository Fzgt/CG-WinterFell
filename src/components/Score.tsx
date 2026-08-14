import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import '../styles/score.css';
import { updateHighScores } from '../utils/utils';

const Score = () => {
    const score = useStore(state => state.score);
    const gameOver = useStore(state => state.gameOver);
    const playerPosition = useStore(state => state.playerPosition);
    const restart = useStore(state => state.restart);
    const [highScores, setHighScores] = useState<number[]>([]);
    const [finalScore, setFinalScore] = useState(0);
    const [finalDistance, setFinalDistance] = useState(0);

    // Distance is what an endless runner is actually about, and unlike the
    // speed readout the HUD used to show, it is something the player is
    // trying to push. Metres, not raw world units.
    const distance = Math.max(0, Math.round(Math.abs(playerPosition[2]) / 10));

    useEffect(() => {
        if (!gameOver) return;
        // Freeze the run's figures: the scene keeps ticking underneath the
        // modal, so reading live state here would let them drift.
        setFinalScore(score);
        setFinalDistance(distance);
        setHighScores(updateHighScores(score));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOver]);

    if (gameOver) {
        // Only the first row matching this run is highlighted, so two equal
        // scores don't both light up.
        const currentIndex = highScores.indexOf(finalScore);

        return (
            <div className="game-over-overlay">
                <div className="game-over-container panel">
                    <h2 className="game-over-title">Run Over</h2>

                    <div className="final-score">
                        {finalScore.toLocaleString()}
                    </div>
                    <div className="final-score-label">Score</div>

                    <div className="run-stats">
                        <div>
                            Distance
                            <strong>{finalDistance.toLocaleString()} m</strong>
                        </div>
                        <div>
                            Best
                            <strong>
                                {(highScores[0] ?? 0).toLocaleString()}
                            </strong>
                        </div>
                    </div>

                    <div className="best-scores">
                        <h3 className="best-scores-title">Best runs</h3>
                        {highScores.length ? (
                            highScores.map((highScore, index) => (
                                <div
                                    key={index}
                                    className={`best-score-row${
                                        index === currentIndex
                                            ? ' is-current'
                                            : ''
                                    }`}
                                >
                                    <span className="best-score-rank">
                                        #{index + 1}
                                    </span>
                                    <span className="best-score-value">
                                        {highScore.toLocaleString()}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="best-score-row">
                                <span>No runs yet</span>
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-primary restart-button"
                        onClick={restart}
                        autoFocus
                    >
                        Run Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="hud">
            <div className="hud-score">
                <span className="hud-score-value">
                    {score.toLocaleString()}
                </span>
                <span className="hud-score-label">Score</span>
            </div>
            <div className="hud-meta">
                <span>
                    <strong>{distance.toLocaleString()}</strong> m
                </span>
            </div>
        </div>
    );
};

export default Score;
