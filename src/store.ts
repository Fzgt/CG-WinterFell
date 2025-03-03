import { create } from 'zustand';
import { Triplet } from "@react-three/cannon";
import { shipSpeed } from './constants';

interface ShipStore {
    shipPosition: Triplet;
    moveShip: () => void;
}


export const useStore = create<ShipStore>((set, get) => ({
    shipPosition: [0, 1, -20],
    moveShip() {
        const [x, y, z] = get().shipPosition;
        set({ shipPosition: [x, y, z - shipSpeed] })
    }
}))