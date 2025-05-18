import { Triplet } from '@react-three/cannon';

export interface ScoreEvent {
    id: number;
    position: Triplet;
    points: number;
}

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
    reduceScore: (points: number) => void;

    scoreEvents: ScoreEvent[];
    addScoreEvent: (position: Triplet, points: number) => void;
    reduceScoreEvent: (position: Triplet, points: number) => void;
    clearScoreEvent: (id: number) => void;

    playerPosition: Triplet;
    setPlayerPosition: (position: Triplet) => void;

    isMusicPlaying: boolean;
    toggleMusic: () => void;
    
    playCollectSound: () => void;
    playNegativeSound: () => void;
}
