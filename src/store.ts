import { create } from 'zustand';
import { Triplet } from "@react-three/cannon";

interface GameStore {
    gameStarted: boolean;
    setGameStarted: (started: boolean) => void;
    
    score: number;
    addScore: (points: number) => void;
    
    playerPosition: Triplet;
    setPlayerPosition: (position: Triplet) => void;
}

export const useStore = create<GameStore>((set) => ({
    gameStarted: false,
    setGameStarted: (started) => set({ gameStarted: started }),
    
    score: 0,
    addScore: (points) => set((state) => ({ score: state.score + points })),
    
    playerPosition: [0, 1, -20], // initial position
    setPlayerPosition: (position) => set({ playerPosition: position })
}))