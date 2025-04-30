import { Triplet } from '@react-three/cannon';

export interface GameStore {
    playerSpeed: number;
    addPlayerSpeed: () => void;

    gameStarted: boolean;
    setGameStarted: (started: boolean) => void;

    gameOver: boolean;
    setGameOver: (over: boolean) => void;

    gamePaused: boolean;
    togglePause: () => void;

    score: number;
    addScore: (points: number) => void;

    playerPosition: Triplet;
    setPlayerPosition: (position: Triplet) => void;

    isMusicPlaying: boolean;
    toggleMusic: () => void;
}
