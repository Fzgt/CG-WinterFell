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

    // Restarting reloads the document instead of remounting the scene.
    // @react-three/fiber v9 no longer disposes on unmount, and most of the
    // geometry and materials here are constructed by hand, so a remount left
    // every buffer and texture from the previous run alive on the GPU —
    // measured at ~800 live buffers after one restart against 463 on a cold
    // start. The reload was dropped originally to avoid re-loading assets;
    // MODEL_PATHS is empty now, so it costs a bundle parse and nothing else.
    // High scores live in localStorage and survive it.
    restart: () => window.location.reload(),

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
