import { useState } from 'react';
import { useProgress } from '@react-three/drei';
import '../styles/welcome.css';
import backgroundImage from '../assets/welcome2.jpg';
interface WelcomePageProps {
    onStart: () => void;
}

const Snowflakes = () => {
    const snowflakes = Array(40)
        .fill(0)
        .map((_, index) => {
            const size = Math.random() * 10 + 2;
            const startPositionX = Math.random() * 100;
            const startPositionY = Math.random() * -100;
            const duration = Math.random() * 10 + 10;
            const delay = Math.random() * 10;

            return (
                <div
                    key={index}
                    className="snowflake"
                    style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${startPositionX}%`,
                        top: `${startPositionY}px`,
                        animationDuration: `${duration}s`,
                        animationDelay: `${delay}s`,
                    }}
                />
            );
        });

    return <div className="snowflakes-container">{snowflakes}</div>;
};

const WelcomePage = ({ onStart }: WelcomePageProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const { progress, loaded, total } = useProgress();
    const isLoading = progress < 100;

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    return (
        <div className="welcome-container" style={{ backgroundImage: `url(${backgroundImage})` }}>
            <Snowflakes />

            <h1 className="title">WinterFell</h1>

            <div className="game-description">
                Navigate through a Halloween winter world filled with enchanting monsters.
            </div>

            <div className="loading-info">
                {isLoading ? (
                    <>
                        <div className="progress-bar">
                            <div
                                className="progress-bar-fill"
                                style={{ transform: `scaleX(${progress / 100})` }}
                            />
                        </div>
                        <div className="loading-text">
                            Loading resources... {Math.round(progress)}%
                            <div className="loading-details">
                                Loaded {loaded} of {total} assets
                            </div>
                        </div>
                    </>
                ) : (
                    <button
                        className={`start-button ${isHovered ? 'hovered' : ''}`}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        onClick={onStart}
                    >
                        Start Game
                    </button>
                )}
            </div>

            {!isLoading && (
                <div className="controls-info">
                    <p>Controls: Use ← → or A D keys to move left and right</p>
                </div>
            )}
        </div>
    );
};

export default WelcomePage;
