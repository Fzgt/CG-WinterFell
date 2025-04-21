import { create } from 'zustand';
import { Triplet } from "@react-three/cannon";

interface GameStore {
    playerSpeed: number;
    addPlayerSpeed: () => void;

    gameStarted: boolean;
    setGameStarted: (started: boolean) => void;

    gameOver: boolean;
    setGameOver: (over: boolean) => void;

    score: number;
    addScore: (points: number) => void;

    playerPosition: Triplet;
    setPlayerPosition: (position: Triplet) => void;
}

export const useStore = create<GameStore>((set) => ({
    playerSpeed: 5,
    addPlayerSpeed: () => set(state => {
        const newSpeed = state.playerSpeed + 3;
        console.log("New player speed:", newSpeed);
        return { playerSpeed: newSpeed };
    }),

    gameStarted: false,
    setGameStarted: (started) => set({ gameStarted: started }),

    gameOver: false,
    setGameOver: (over) => set({ gameOver: over }),

    score: 0,
    addScore: (points) => set((state) => {
        if (!state.gameOver) {
            return { score: state.score + points };
        }
        return state;
    }),

    playerPosition: [0, 1, -20], // player initial position
    setPlayerPosition: (position) => set({ playerPosition: position })
}));