import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/store';
import jimucantingMusic from '../audios/jimucanting.mp3';
import lingchenMusic from '../audios/lingchenjichengche.mp3';

interface MusicProps {
    onStart: boolean;
}

interface MusicTrack {
    url: string;
    name: string;
}

const musicTracks: MusicTrack[] = [
    {
        url: lingchenMusic,
        name: '凌晨计程车',
    },
    {
        url: jimucantingMusic,
        name: '吉姆餐厅',
    },
];

// Audio files preloaded here
export const AudioPreloader = () => {
    useEffect(() => {
        musicTracks.forEach(track => {
            console.log(`Starting to preload: ${track.name}`);
            const audio = new Audio();
            audio.src = track.url;
            audio.load();
            audio.onloadeddata = () => {
                console.log(`Successfully preloaded: ${track.name}`);
            };
            audio.onerror = err => {
                console.error(`Error preloading ${track.name}:`, err);
            };
        });
    }, []);

    return null;
};

const Music = ({ onStart }: MusicProps) => {
    const { camera } = useThree();
    const isMusicPlaying = useStore(state => state.isMusicPlaying);
    const gamePaused = useStore(state => state.gamePaused);
    const soundRef = useRef<THREE.Audio | null>(null);
    const listenerRef = useRef<THREE.AudioListener | null>(null);
    const loadedRef = useRef(false);
    const wasPlayingBeforePauseRef = useRef(true);

    const startTimeRef = useRef(0);
    const pausedTimeRef = useRef(0);
    const isPlayingRef = useRef(false);
    const currentTrackIndexRef = useRef(0);

    window.currentTrackName = musicTracks[0].name;

    const loadAndPlayTrack = (trackIndex: number) => {
        if (!soundRef.current || !listenerRef.current) return;

        const index = trackIndex % musicTracks.length;
        currentTrackIndexRef.current = index;
        window.currentTrackName = musicTracks[index].name;

        const sound = soundRef.current;

        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            musicTracks[index].url,
            buffer => {
                if (soundRef.current) {
                    sound.setBuffer(buffer);
                    sound.setLoop(false);
                    sound.setVolume(0.5);

                    if (isMusicPlaying && !gamePaused) {
                        customPlay();
                    }
                    loadedRef.current = true;

                    console.log(`Now playing: ${musicTracks[index].name}`);
                }
            },
            xhr => {
                console.log(`Audio loading: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`);
            },
            err => {
                console.error('An error happened loading the audio', err);
            }
        );
    };

    const playNextTrack = () => {
        const nextIndex = (currentTrackIndexRef.current + 1) % musicTracks.length;
        loadAndPlayTrack(nextIndex);
    };

    const customPlay = () => {
        if (!soundRef.current || !soundRef.current.buffer || isPlayingRef.current) return;

        const sound = soundRef.current;
        const audioContext = sound.context;
        const buffer = sound.buffer;

        if (!buffer) return;

        sound.offset = pausedTimeRef.current % buffer.duration;
        sound.play();

        startTimeRef.current = audioContext.currentTime;
        isPlayingRef.current = true;

        console.log(`Resuming at offset: ${sound.offset}`);
    };

    const customPause = () => {
        if (!soundRef.current || !isPlayingRef.current) return;

        const sound = soundRef.current;
        const audioContext = sound.context;

        const elapsedSinceStart = audioContext.currentTime - startTimeRef.current;
        pausedTimeRef.current = pausedTimeRef.current + elapsedSinceStart;

        sound.pause();
        isPlayingRef.current = false;

        console.log(`Paused at total time: ${pausedTimeRef.current}`);
    };

    const handleAudioEnded = () => {
        playNextTrack();
    };

    useEffect(() => {
        if (!onStart) return;

        if (!listenerRef.current) {
            const listener = new THREE.AudioListener();
            camera.add(listener);
            listenerRef.current = listener;

            const sound = new THREE.Audio(listener);
            sound.onEnded = handleAudioEnded;
            soundRef.current = sound;

            startTimeRef.current = 0;
            pausedTimeRef.current = 0;
            isPlayingRef.current = false;

            loadAndPlayTrack(currentTrackIndexRef.current);
        }

        return () => {
            if (soundRef.current) {
                if (soundRef.current.isPlaying) {
                    soundRef.current.stop();
                }
                if (soundRef.current.source) {
                    soundRef.current.source.removeEventListener('ended', handleAudioEnded);
                }
                isPlayingRef.current = false;
                pausedTimeRef.current = 0;
                startTimeRef.current = 0;
            }
            if (listenerRef.current && camera) {
                camera.remove(listenerRef.current);
            }
        };
    }, [onStart, camera]);

    useEffect(() => {
        if (!loadedRef.current || !soundRef.current) return;

        if (!gamePaused) {
            if (isMusicPlaying) {
                if (!isPlayingRef.current) {
                    customPlay();
                }
            } else {
                if (isPlayingRef.current) {
                    customPause();
                }
            }
        }

        wasPlayingBeforePauseRef.current = isMusicPlaying;
    }, [isMusicPlaying, gamePaused]);

    useEffect(() => {
        if (!loadedRef.current || !soundRef.current) return;

        if (gamePaused) {
            if (isPlayingRef.current) {
                customPause();
            }
        } else {
            if (wasPlayingBeforePauseRef.current && !isPlayingRef.current) {
                customPlay();
            }
        }
    }, [gamePaused]);

    return null;
};

export const MusicControl = () => {
    const isMusicPlaying = useStore(state => state.isMusicPlaying);
    const toggleMusic = useStore(state => state.toggleMusic);
    const [isHovered, setIsHovered] = useState(false);
    const [currentSong, setCurrentSong] = useState(musicTracks[0].name);

    useEffect(() => {
        const updateSongInterval = setInterval(() => {
            if (window.currentTrackName && window.currentTrackName !== currentSong) {
                setCurrentSong(window.currentTrackName);
            }
        }, 1000);

        return () => clearInterval(updateSongInterval);
    }, [currentSong]);

    const controlContainerStyle: React.CSSProperties = {
        position: 'fixed',
        top: '15px',
        right: '15px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
    };

    const buttonStyle: React.CSSProperties = {
        background: isHovered ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
        border: 'none',
        borderRadius: '50%',
        color: 'white',
        cursor: 'pointer',
        fontSize: '20px',
        height: '40px',
        width: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background-color 0.3s',
    };

    const songInfoStyle: React.CSSProperties = {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '14px',
        marginRight: '10px',
        transition: 'background-color 0.3s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '200px',
    };

    return (
        <div style={controlContainerStyle}>
            <div style={songInfoStyle}>{currentSong}</div>
            <button
                onClick={toggleMusic}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={buttonStyle}
                title={isMusicPlaying ? 'Pause music' : 'Play music'}
            >
                {isMusicPlaying ? '🔊' : '🔇'}
            </button>
        </div>
    );
};

declare global {
    interface Window {
        currentTrackName: string;
    }
}

export default Music;
