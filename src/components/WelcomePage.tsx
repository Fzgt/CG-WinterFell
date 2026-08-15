import { useMemo } from 'react';
import { useProgress } from '@react-three/drei';
import '../styles/welcome.css';

interface WelcomePageProps {
    onStart: () => void;
}

const EMBER_COUNT = 28;

const Embers = () => {
    // Positions are fixed for the life of the menu; regenerating them on every
    // render would restart each animation and make the field twitch.
    const embers = useMemo(
        () =>
            Array.from({ length: EMBER_COUNT }, (_, index) => {
                const size = Math.random() * 4 + 2;
                return {
                    key: index,
                    style: {
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${Math.random() * 100}%`,
                        animationDuration: `${Math.random() * 9 + 9}s`,
                        animationDelay: `${Math.random() * 12}s`,
                        '--drift': `${Math.random() * 120 - 60}px`,
                    } as React.CSSProperties,
                };
            }),
        [],
    );

    return (
        <div className="embers-container" aria-hidden="true">
            {embers.map(({ key, style }) => (
                <div key={key} className="ember" style={style} />
            ))}
        </div>
    );
};

const WelcomePage = ({ onStart }: WelcomePageProps) => {
    const { progress, loaded, total } = useProgress();
    const isLoading = progress < 100;

    return (
        <div className="welcome-container">
            <Embers />

            <div className="welcome-content">
                <h1 className="title">Winterfell</h1>

                <p className="tagline">
                    Outrun the grid. Thread the pylons, take the light, and
                    see how many sectors you can clear before it catches you.
                </p>

                <div className="loading-info">
                    {isLoading ? (
                        <>
                            <div
                                className="progress-bar"
                                role="progressbar"
                                aria-valuenow={Math.round(progress)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div
                                    className="progress-bar-fill"
                                    style={{
                                        transform: `scaleX(${progress / 100})`,
                                    }}
                                />
                            </div>
                            <div className="loading-text">
                                Powering up the grid…{' '}
                                <strong>{Math.round(progress)}%</strong>
                                {total > 0 && (
                                    <>
                                        {' '}
                                        ({loaded}/{total})
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <button
                            className="btn btn-primary start-button"
                            onClick={onStart}
                        >
                            Start Run
                        </button>
                    )}
                </div>

                {!isLoading && (
                    <div className="controls-info">
                        <p>
                            <span className="key">←</span>
                            <span className="key">→</span> or{' '}
                            <span className="key">A</span>
                            <span className="key">D</span> to steer
                        </p>
                        <p>
                            <span className="key">Space</span> to pause
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WelcomePage;
