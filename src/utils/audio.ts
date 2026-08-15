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

export const audioContext = () => context();
export const masterGain = () => master;

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

interface NoteOptions extends ToneOptions {
    /** Absolute AudioContext time to start at; overrides `delay`. */
    at?: number;
}

/**
 * Schedule a note at an absolute AudioContext time. The music scheduler needs
 * this — it plans notes ahead against the audio clock, and "delay from now"
 * drifts with however late the scheduling tick happened to run.
 */
export const noteAt = ({
    freq,
    toFreq,
    duration,
    delay = 0,
    at,
    type = 'square',
    gain = 0.5,
}: NoteOptions) => {
    const audio = context();
    if (!audio || !master) return;

    const start = at ?? audio.currentTime + delay;
    const osc = audio.createOscillator();
    const env = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + duration);

    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
};

const tone = (options: ToneOptions) => noteAt(options);

/**
 * Sector fanfare: a quick pentatonic sparkle up two octaves into a held major
 * chord with a slight detune shimmer. The first version was four slow square
 * waves — accurate, but it sounded like an appliance acknowledging an input
 * rather than the game celebrating anything.
 */
export const playLevelCue = (level: number) => {
    const root = 330 * Math.pow(2, (level % 6) / 12);
    [0, 4, 7, 12, 16, 19].forEach((semitone, i) => {
        tone({
            freq: root * Math.pow(2, semitone / 12),
            duration: 0.16,
            delay: i * 0.05,
            type: 'triangle',
            gain: 0.3 - i * 0.02,
        });
    });
    // The landing chord, two voices slightly detuned so it rings.
    [12, 16, 19, 24].forEach(semitone => {
        const freq = root * Math.pow(2, semitone / 12);
        tone({ freq, duration: 0.6, delay: 0.32, type: 'triangle', gain: 0.15 });
        tone({ freq: freq * 1.006, duration: 0.6, delay: 0.32, type: 'sine', gain: 0.1 });
    });
};

/** Every hundred metres: a tiny two-note tick, reward without interruption. */
export const playMilestone = () => {
    tone({ freq: 1320, duration: 0.08, type: 'triangle', gain: 0.2 });
    tone({ freq: 1760, duration: 0.12, delay: 0.055, type: 'triangle', gain: 0.18 });
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
