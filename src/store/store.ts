import { create } from 'zustand';
import { GameStore, ScoreEvent } from '../types/store';

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

    scoreEvents: [] as ScoreEvent[],
    addScoreEvent: (position, points) =>
        set(state => {
            if (!state.gameOver && !state.gamePaused) {
                const newEvent: ScoreEvent = {
                    id: Date.now(),
                    position,
                    points
                };
                return { scoreEvents: [...state.scoreEvents, newEvent] };
            }
            return state;
        }),
    clearScoreEvent: (id) =>
        set(state => ({
            scoreEvents: state.scoreEvents.filter(event => event.id !== id)
        })),

    playerPosition: [0, 1, -20], // player initial position
    setPlayerPosition: position => set({ playerPosition: position }),

    isMusicPlaying: true,
    toggleMusic: () => set(state => ({ isMusicPlaying: !state.isMusicPlaying })),
}));