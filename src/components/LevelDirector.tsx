import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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
    const level = useStore(state => state.level);
    const gameOver = useStore(state => state.gameOver);
    const setLevel = useStore(state => state.setLevel);
    const setPlayerSpeed = useStore(state => state.setPlayerSpeed);
    const lastAnnounced = useRef(-1);

    // Read, don't subscribe: the player's position changes every frame, and
    // only its level bucket matters here.
    useFrame(() => {
        if (gameOver) return;
        const next = levelAt(useStore.getState().playerPosition[2]);
        if (next !== level) setLevel(next);
    });

    useEffect(() => {
        const palette = paletteFor(level);
        setPlayerSpeed(palette.speed);

        // Hand the palette to CSS so the HUD, pause screen and game-over panel
        // are the same colour as the level behind them, instead of staying the
        // one accent they were designed with.
        const root = document.documentElement.style;
        root.setProperty('--level-neon', palette.neon);
        root.setProperty('--level-accent', palette.accent);
        const [r, g, b] = new THREE.Color(palette.neon)
            .toArray()
            .map(v => Math.round(v * 255));
        root.setProperty('--ember-glow', `rgba(${r}, ${g}, ${b}, 0.38)`);
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
