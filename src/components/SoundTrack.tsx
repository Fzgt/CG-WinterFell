import { Howl } from 'howler'
import { useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import halloween_sound from '../assets/audio/spooky-halloween-soundtrack.mp3'
import collectCoinSound from '../assets/audio/collectcoin.wav'
import negativeCollectSound from '../assets/audio/negativeCollectionSound.wav'

interface MusicProps {
    onStart: boolean;
}

const SoundTrack = ({ onStart }: MusicProps) => {
    const soundRef = useRef<Howl | null>(null)
    const isMusicPlaying = useStore(state => state.isMusicPlaying)
    const gamePaused = useStore(state => state.gamePaused)
    const loopCountRef = useRef(0);
    const playbackRateRef = useRef(1.0);        
    const isLoopingRef = useRef(false)
    const currentPlayingRef = useRef<string>('') // 'intro' or 'loop'
    const currentSoundIdRef = useRef<number | null>(null)

    const INTRO_DURATION = 32; // 0-32 sec
    const LOOP_DURATION = 16;  // 32-48 sec

    //Collection sound effect
    const collectSoundRef = useRef<Howl | null>(null)

    // Initialize collection sound effects
    useEffect(() => {
        const collectSound = new Howl({
            src: [collectCoinSound],
            volume: 0.5,
            preload: true
        });
        
        const negativeSound = new Howl({
            src: [negativeCollectSound],
            volume: 0.6,
            preload: true
        });

        collectSoundRef.current = collectSound;

        // Update store with play methods
        useStore.setState({ 
            playCollectSound: () => collectSound.play(),
            playNegativeSound: () => negativeSound.play() 
        });

        return () => {
            collectSound.unload();
            negativeSound.unload();
            collectSoundRef.current = null;
        };
    }, []);

    // Initialize background music
    useEffect(() => {
        if (!onStart) return;

        const sound = new Howl({
            src: [halloween_sound],
            volume: 0.3,
            preload: true,
            sprite: {
                //intro
                intro: [0, INTRO_DURATION * 1000],
                //loop
                loop: [INTRO_DURATION * 1000, LOOP_DURATION * 1000]
            },
            onend: () => {
                if (!soundRef.current) return;

                if (currentPlayingRef.current === 'intro') {
                    isLoopingRef.current = true;
                    playLoop();
                } else if (currentPlayingRef.current === 'loop') {
                    playLoop();
                }
            }
        });

        soundRef.current = sound;

        if (isMusicPlaying) {
            isLoopingRef.current = false;
            currentPlayingRef.current = 'intro';
            currentSoundIdRef.current = sound.play('intro');
        }

        return () => {
            sound.unload();
            soundRef.current = null;
            loopCountRef.current = 0;
            playbackRateRef.current = 1.0;
            isLoopingRef.current = false;
            currentPlayingRef.current = '';
            currentSoundIdRef.current = null;
        };
    }, [onStart, isMusicPlaying]);

    const playLoop = () => {
        if (!soundRef.current) return;
    
        loopCountRef.current += 1;
    
        const additionalRate = Math.max((loopCountRef.current - 1) * 0.05, 0);
        const newRate = Math.min(1.0 + additionalRate, 5.0);
    
        playbackRateRef.current = newRate;
        soundRef.current.rate(newRate);
    
        currentPlayingRef.current = 'loop';
        currentSoundIdRef.current = soundRef.current.play('loop');
    };
    

    useEffect(() => {
        if (!soundRef.current) return;

        const sound = soundRef.current;

        if (gamePaused && currentSoundIdRef.current !== null) {
            sound.pause(currentSoundIdRef.current);
        } else if (!gamePaused && isMusicPlaying && currentSoundIdRef.current !== null) {
            sound.play(currentSoundIdRef.current);
        }
    }, [isMusicPlaying, gamePaused]);

    return null;
};

export default SoundTrack;
