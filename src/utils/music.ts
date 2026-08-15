import { audioContext, noteAt } from './audio';

/**
 * The soundtrack and the beat clock, in one place.
 *
 * A procedural synthwave loop — kick, off-beat hat, eighth-note bass, a pad
 * every other bar — scheduled ahead against the AudioContext clock with the
 * classic lookahead pattern: a coarse JS interval wakes up often, and anything
 * due inside the next window is scheduled at sample-accurate times. rAF or
 * setTimeout alone drift; the audio clock does not.
 *
 * The same clock is exported as beat information, which is what makes it more
 * than background music: the grid, the obstacle frames, the beacons and the
 * engine all read beatPulse() and breathe on the kick, and the obstacle
 * generator spaces formations in beat-lengths. The lesson borrowed from
 * A Dance of Fire and Ice is that audio, visuals and play should be one
 * clock — this is that clock.
 *
 * Tempo and key both follow the sector: each one is a semitone up and a few
 * BPM faster, applied at the next bar boundary so the transition lands
 * musically rather than mid-phrase.
 */
export const BPM_BASE = 112;
const BPM_PER_LEVEL = 5;
const BPM_MAX = 168;
const BEATS_PER_BAR = 4;
const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 30;

export const bpmFor = (level: number) =>
    Math.min(BPM_BASE + level * BPM_PER_LEVEL, BPM_MAX);

interface ClockState {
    /** Absolute time of beat `anchorIndex`, and the tempo from that point. */
    anchorTime: number;
    anchorIndex: number;
    beatDur: number;
    keyLevel: number;
}

let timer: ReturnType<typeof setInterval> | null = null;
let clock: ClockState | null = null;
let nextBeatTime = 0;
let nextBeatIndex = 0;
let pendingLevel: number | null = null;

const bassPattern = [0, 0, 7, 0, 12, 0, 7, 5]; // eighth-note offsets per bar

const rootFor = (keyLevel: number) =>
    55 * Math.pow(2, (keyLevel % 6) / 12); // A1, a semitone up per sector

const scheduleBeat = (index: number, at: number, state: ClockState) => {
    const { beatDur, keyLevel } = state;
    const root = rootFor(keyLevel);

    // Kick: a fast pitch drop on every beat.
    noteAt({ freq: 150, toFreq: 44, at, duration: 0.11, type: 'sine', gain: 0.5 });

    // Hat: a tiny bright blip on the off-beat.
    noteAt({
        freq: 7600,
        at: at + beatDur / 2,
        duration: 0.02,
        type: 'square',
        gain: 0.035,
    });

    // Bass: two eighth notes per beat, pattern cycling per bar.
    for (const half of [0, 1]) {
        const step = (index % BEATS_PER_BAR) * 2 + half;
        const semitone = bassPattern[step % bassPattern.length];
        noteAt({
            freq: root * Math.pow(2, semitone / 12),
            at: at + (half * beatDur) / 2,
            duration: beatDur * 0.42,
            type: 'sawtooth',
            gain: 0.11,
        });
    }

    // Pad: a soft triad sustained across every other bar.
    if (index % (BEATS_PER_BAR * 2) === 0) {
        for (const semitone of [12, 16, 19]) {
            noteAt({
                freq: root * 2 * Math.pow(2, semitone / 12),
                at,
                duration: beatDur * BEATS_PER_BAR * 1.6,
                type: 'triangle',
                gain: 0.035,
            });
        }
    }
};

const tick = () => {
    const ctx = audioContext();
    if (!ctx || !clock) return;

    while (nextBeatTime < ctx.currentTime + LOOKAHEAD_SEC) {
        // Tempo and key changes land on bar boundaries only.
        if (pendingLevel !== null && nextBeatIndex % BEATS_PER_BAR === 0) {
            clock = {
                anchorTime: nextBeatTime,
                anchorIndex: nextBeatIndex,
                beatDur: 60 / bpmFor(pendingLevel),
                keyLevel: pendingLevel,
            };
            pendingLevel = null;
        }
        scheduleBeat(nextBeatIndex, nextBeatTime, clock);
        nextBeatTime += clock.beatDur;
        nextBeatIndex += 1;
    }
};

export const startMusic = (level: number) => {
    const ctx = audioContext();
    if (!ctx || timer) return;

    const start = ctx.currentTime + 0.1;
    clock = {
        anchorTime: start,
        anchorIndex: 0,
        beatDur: 60 / bpmFor(level),
        keyLevel: level,
    };
    nextBeatTime = start;
    nextBeatIndex = 0;
    pendingLevel = null;
    timer = setInterval(tick, TICK_MS);
};

export const stopMusic = () => {
    if (timer) clearInterval(timer);
    timer = null;
    clock = null;
};

/** Takes effect at the next bar, so sector changes land musically. */
export const setMusicLevel = (level: number) => {
    if (!clock) return;
    if (level !== clock.keyLevel) pendingLevel = level;
};

export interface BeatInfo {
    /** 0 at the kick, rising to 1 just before the next. */
    phase: number;
    index: number;
    beatDur: number;
}

export const getBeat = (): BeatInfo | null => {
    const ctx = audioContext();
    if (!ctx || !clock) return null;
    const beats = (ctx.currentTime - clock.anchorTime) / clock.beatDur;
    if (beats < 0) return { phase: 0, index: clock.anchorIndex, beatDur: clock.beatDur };
    return {
        phase: beats % 1,
        index: clock.anchorIndex + Math.floor(beats),
        beatDur: clock.beatDur,
    };
};

/**
 * 1.0 on the kick, decaying to 0 — the single number the visuals breathe on.
 * Returns 0 when no music is running, so everything degrades to static.
 */
export const beatPulse = (): number => {
    const beat = getBeat();
    if (!beat) return 0;
    return Math.pow(1 - beat.phase, 3);
};
