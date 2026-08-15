import { Triplet } from '@react-three/cannon';

export interface GameStore {
    playerSpeed: number;
    setPlayerSpeed: (speed: number) => void;

    gameStarted: boolean;
    setGameStarted: (started: boolean) => void;

    gameOver: boolean;
    setGameOver: (over: boolean) => void;

    level: number;
    setLevel: (level: number) => void;

    runId: number;
    restart: () => void;

    gamePaused: boolean;
    togglePause: () => void;

    playerPosition: Triplet;
    setPlayerPosition: (position: Triplet) => void;

    /** DEV ONLY: scenic mode (no obstacles). */
    scenic: boolean;
    setScenic: (on: boolean) => void;

    isMusicPlaying: boolean;
    toggleMusic: () => void;
}
