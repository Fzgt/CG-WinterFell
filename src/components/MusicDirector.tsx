import { useEffect } from 'react';
import { useStore } from '../store/store';
import { startMusic, stopMusic, setMusicLevel } from '../utils/music';
import { audioContext } from '../utils/audio';

/**
 * Owns the soundtrack's lifecycle: start on a run, stop on a crash, restart
 * with the run, key/tempo up with the sector, and suspend the whole context
 * while paused so the silence is actually silent.
 */
const MusicDirector = () => {
    const gameOver = useStore(state => state.gameOver);
    const gamePaused = useStore(state => state.gamePaused);
    const level = useStore(state => state.level);
    const runId = useStore(state => state.runId);

    useEffect(() => {
        if (gameOver) return;
        startMusic(useStore.getState().level);
        return () => stopMusic();
    }, [gameOver, runId]);

    useEffect(() => {
        setMusicLevel(level);
    }, [level]);

    useEffect(() => {
        const ctx = audioContext();
        if (!ctx) return;
        if (gamePaused) void ctx.suspend();
        else void ctx.resume();
    }, [gamePaused]);

    return null;
};

export default MusicDirector;
