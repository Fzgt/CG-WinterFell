import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/store';
import { levelAt, paletteFor } from '../config/levels';
import { playLevelCue } from '../utils/audio';

/**
 * Owns level progression: watches how far the player has run, and when they
 * cross into the next level sets the speed, recolours the world and sounds
 * the cue.
 *
 * This used to be buried in the obstacle field, which nudged speed upward
 * whenever the player passed one of four hardcoded distance thresholds and
 * recoloured the pumpkins as a side effect. Pulling it out means one place
 * decides what a level is, and everything else just reads the current one.
 */
const LevelDirector = () => {
    const playerPosition = useStore(state => state.playerPosition);
    const level = useStore(state => state.level);
    const gameOver = useStore(state => state.gameOver);
    const setLevel = useStore(state => state.setLevel);
    const setPlayerSpeed = useStore(state => state.setPlayerSpeed);
    const lastAnnounced = useRef(-1);

    useFrame(() => {
        if (gameOver) return;
        const next = levelAt(playerPosition[2]);
        if (next !== level) setLevel(next);
    });

    useEffect(() => {
        setPlayerSpeed(paletteFor(level).speed);
        // Level 0 is the start of the run, not an advancement, so it gets no
        // fanfare — otherwise every restart would open with a level-up.
        if (level > 0 && level !== lastAnnounced.current) {
            playLevelCue(level);
        }
        lastAnnounced.current = level;
    }, [level, setPlayerSpeed]);

    return null;
};

export default LevelDirector;
