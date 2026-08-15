import { create } from 'zustand';
import { GameStore } from '../types/store';

export const useStore = create<GameStore>(set => ({
    playerSpeed: 15,
    // Speed is a property of the level, not something accumulated by passing
    // thresholds, so the director sets it outright.
    setPlayerSpeed: speed => set({ playerSpeed: speed }),

    gameStarted: false,
    setGameStarted: started => set({ gameStarted: started }),

    gameOver: false,
    setGameOver: over => set({ gameOver: over }),

    level: 0,
    setLevel: level => set({ level }),

    // Bumping this remounts the scene (see Game.tsx), which resets every
    // section, the craft and the physics world without reloading the page —
    // restarting used to be window.location.reload(), which meant sitting
    // through a full asset load between two-second runs.
    runId: 0,
    restart: () =>
        set(state => ({
            runId: state.runId + 1,
            gameOver: false,
            gamePaused: false,
            playerSpeed: 15,
            level: 0,
            playerPosition: [0, 1, -20],
        })),

    gamePaused: false,
    togglePause: () => set(state => ({ gamePaused: !state.gamePaused })),

    playerPosition: [0, 1, -20],
    setPlayerPosition: position => set({ playerPosition: position }),

    // DEV ONLY: scenic mode — no obstacles, no collisions, just the ride,
    // for reviewing the twenty scenes. Comment out before pushing, together
    // with the WelcomePage button.
    scenic: false,
    setScenic: on => set({ scenic: on }),

    isMusicPlaying: true,
    toggleMusic: () => set(state => ({ isMusicPlaying: !state.isMusicPlaying })),
}));
