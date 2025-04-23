import { create } from 'zustand';
import { GameStore } from '../types/store';

export const useStore = create<GameStore>(set => ({
    playerSpeed: 12,
    addPlayerSpeed: () =>
        set(state => {
            const newSpeed = state.playerSpeed + 5;
            console.log('New player speed:', newSpeed);
            return { playerSpeed: newSpeed };
        }),

    gameStarted: false,
    setGameStarted: started => set({ gameStarted: started }),

    gameOver: false,
    setGameOver: over => set({ gameOver: over }),

    gamePaused: false,
    togglePause: () => set(state => ({ gamePaused: !state.gamePaused })),

    score: 0,
    addScore: points =>
        set(state => {
            if (!state.gameOver && !state.gamePaused) {
                return { score: state.score + points };
            }
            return state;
        }),

    playerPosition: [0, 1, -20], // player initial position
    setPlayerPosition: position => set({ playerPosition: position }),
}));
