import { Triplet } from '@react-three/cannon';

export interface ScoreEvent {
    id: number;
    position: Triplet;
    points: number;
}

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
