/**
 * Every sound in the game, synthesised.
 *
 * There are no audio files: a level cue, a pickup and a crash are all short
 * enough to build from oscillators, which keeps the bundle free of the 2.5MB
 * of wav and mp3 this used to ship and means the palette of sounds can follow
 * the level the same way the colours do.
 *
 * The context is created lazily on first use, because browsers refuse to start
 * one before a user gesture.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const context = () => {
    if (!ctx) {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
    }
    // Autoplay policy can leave it suspended until a gesture resumes it.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
};

export const setMuted = (value: boolean) => {
    muted = value;
    if (master) master.gain.value = value ? 0 : 0.35;
};

export const isMuted = () => muted;

interface ToneOptions {
    freq: number;
    /** Slide to this frequency across the note, if given. */
    toFreq?: number;
    duration: number;
    /** Seconds from now. */
    delay?: number;
    type?: OscillatorType;
    gain?: number;
}

const tone = ({
    freq,
    toFreq,
    duration,
    delay = 0,
    type = 'square',
    gain = 0.5,
}: ToneOptions) => {
    const audio = context();
    if (!audio || !master) return;

    const start = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const env = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + duration);

    // A short attack and an exponential tail: instant on, no click off.
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
};

/** Rising arpeggio, a step higher with each level, so progress is audible. */
export const playLevelCue = (level: number) => {
    const root = 220 * Math.pow(2, (level % 6) / 6);
    [0, 4, 7, 12].forEach((semitone, i) => {
        tone({
            freq: root * Math.pow(2, semitone / 12),
            duration: 0.5,
            delay: i * 0.075,
            type: i === 3 ? 'sawtooth' : 'square',
            gain: 0.32,
        });
    });
};

export const playPickup = () => {
    tone({ freq: 880, toFreq: 1320, duration: 0.14, type: 'triangle', gain: 0.3 });
};

export const playPenalty = () => {
    tone({ freq: 320, toFreq: 110, duration: 0.28, type: 'sawtooth', gain: 0.28 });
};

export const playCrash = () => {
    tone({ freq: 180, toFreq: 40, duration: 0.7, type: 'sawtooth', gain: 0.4 });
    tone({ freq: 90, toFreq: 30, duration: 0.9, type: 'square', gain: 0.3 });
};
