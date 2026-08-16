import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import '../styles/score.css';
import { updateHighScores } from '../utils/utils';
import { playMilestone } from '../utils/audio';

const Score = () => {
    const gameOver = useStore(state => state.gameOver);
    const level = useStore(state => state.level);
    const restart = useStore(state => state.restart);
    const [highScores, setHighScores] = useState<number[]>([]);
    const [finalScore, setFinalScore] = useState(0);
    const [finalLevel, setFinalLevel] = useState(0);
    const [pop, setPop] = useState(false);

    // The score is the distance survived. Collectibles used to supply it,
    // which meant a run could end on a negative number after clipping a few
    // hazards — a strange thing to show someone who just travelled a mile.
    // Metres, not raw world units.
    //
    // Selected down to the number on screen rather than taken from the raw
    // position: the store is handed a fresh position array every frame, so
    // subscribing to the array itself re-rendered this panel — game-over
    // modal, best-runs table and all — sixty times a second.
    const distance = useStore(state =>
        Math.max(0, Math.round(Math.abs(state.playerPosition[2]) / 10)),
    );

    useEffect(() => {
        if (!gameOver) return;
        // Freeze the run's figures: the scene keeps ticking underneath the
        // modal, so reading live state here would let them drift.
        setFinalScore(distance);
        setFinalLevel(level);
        setHighScores(updateHighScores(distance));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOver]);

    // Every hundred metres the counter pops and ticks. The number climbing on
    // its own reads as a clock; a beat every 100m makes it a reward.
    const milestone = Math.floor(distance / 100);
    useEffect(() => {
        if (milestone === 0 || gameOver) return;
        setPop(true);
        playMilestone();
        const timer = setTimeout(() => setPop(false), 450);
        return () => clearTimeout(timer);
    }, [milestone, gameOver]);

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
                        <span className="final-score-unit">m</span>
                    </div>
                    <div className="final-score-label">Distance</div>

                    <div className="run-stats">
                        <div>
                            Sector
                            <strong>{finalLevel + 1}</strong>
                        </div>
                        <div>
                            Best
                            <strong>
                                {(highScores[0] ?? 0).toLocaleString()} m
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
                                        {highScore.toLocaleString()} m
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
                <span className={`hud-score-value${pop ? ' pop' : ''}`}>
                    {distance.toLocaleString()}
                </span>
                <span className="hud-score-label">m</span>
            </div>
            <div className="hud-meta">
                <span>Sector {level + 1}</span>
            </div>
        </div>
    );
};

export default Score;
