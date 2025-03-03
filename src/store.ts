import { create } from 'zustand';
import { Triplet } from "@react-three/cannon";
import { shipSpeed } from './constants';

interface ShipStore {
    shipPosition: Triplet;
    moveShip: (move?: Triplet) => void;
}


export const useStore = create<ShipStore>((set, get) => ({
    shipPosition: [0, 1, -20],
    moveShip([moveX, moveY, moveZ]: Triplet = [0, 0, 0]) {
        const [x, y, z] = get().shipPosition;

        set({
            shipPosition: [x + moveX, y + moveY, z - shipSpeed - moveZ]
        })
    }
}))