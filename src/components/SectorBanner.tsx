import { useStore } from '../store/store';

/**
 * A full-screen flash of the sector number when a new one begins.
 *
 * The world changing colour said "something happened"; this says what. Keyed
 * on the level so the animation re-runs on every advance, and pointer-events
 * none so it can never get in the way of playing through it.
 */
const SectorBanner = () => {
    const level = useStore(state => state.level);
    const gameOver = useStore(state => state.gameOver);

    // Level 0 is the start of the run, not an achievement.
    if (level === 0 || gameOver) return null;

    return (
        <div className="sector-banner" key={level} aria-hidden="true">
            <span className="sector-banner-label">Sector</span>
            <span className="sector-banner-number">{level + 1}</span>
        </div>
    );
};

export default SectorBanner;
