/**
 * The choir demo: Leontovych's four-part "Shchedryk" (shown as "Carol of the Bells"), sung live
 * by four voice engines at once on one clock (src/audio/ChoirEngine.ts). The score
 * (carol-satb.json = refs/satb-full-validated.json, validated against the public-domain editions
 * it lists) is the whole piece: 37 written bars with their repeat expanded, 205.5 beats, ending
 * on the final cadence (a once-through 111-beat encoding used to stop mid-piece). It gives each part
 * [MIDI, beats] notes; a note with MIDI <= 0 is a rest, so the leading rests stagger the
 * entrances (soprano bar 1, alto 5, tenor 9, bass 13). Every sung note is the nonlexical "la".
 *
 * All four parts are planned on the main thread with the same bpm and the same time 0 (T0
 * seconds into the run): a part's phrase after a rest starts at T0 plus the beats before it.
 */
import { create } from "zustand";
import { choir, type ChoirProgress } from "../audio/ChoirEngine.ts";
import { planSong } from "../wasm/engine.ts";
import type { PartPlan } from "../worklet/choirPart.ts";
import { WARM_S, XFADE_S } from "../worklet/choirStream.ts";
import type { BodyMix, Gesture, SungNote, Syllable } from "../wasm/types.ts";
import SCORE_JSON from "./carol-satb.json";

export interface ChoirScore {
  title: string;
  subtitle: string;
  bpm: number;
  /** bars as written (37, with a repeat) and as sung (the repeat expanded: 68.5) */
  bars_written: number;
  bars_sounding: number;
  total_beats: number;
  sources: string[];
  parts: Record<string, { entrance_bar: number; notes: [number, number][] }>;
}

export interface ChoirPart {
  key: string;
  name: string;
  /** the voice that sings it (no setup needed) */
  body: BodyMix;
  voice: VoiceSpec;
  bodyName: string;
  gain: number;
  notes: [number, number][];
  /** the beat of its first sung note */
  entranceBeat: number;
}

export const SCORE = SCORE_JSON as unknown as ChoirScore;
export const CHOIR_NAME = "Carol of the Bells";
/** the run's time 0 to the first beat (s) */
export const T0 = 0.35;
export const BEATS_PER_BAR = 3;
/** sung bars, the written repeat expanded (205.5 beats: the last bar is a half bar) */
export const BARS = Math.ceil(SCORE.total_beats / BEATS_PER_BAR);

/** the sung "la" (/lɑ/), given directly: no pronouncing dictionary to download for one syllable */
export const LA: Syllable = { text: "la", onset: [{ ipa: "l", stress: 0 }], nucleus: { ipa: "ɑ", stress: 1 }, coda: [], wordEnd: true, phraseEnd: false };

/** tempo knob range (bpm); the score's own is 112 */
export const TEMPO_MIN = 80;
export const TEMPO_MAX = 140;
/** voice-tone knob: 0 dark … 1 bright */
export const TONE_DEFAULT = 0.5;

/** How a part's voice is built: its body; its folds' brightness; its larynx (cm, added to every
 *  planned larynx target: lower is a longer, darker tract); its lip rounding (added to every
 *  planned lipProt target: a "covered", darker vowel); and its singer's ring (the epilarynx
 *  narrowed, 0..1: the bright 3 kHz band). */
export interface VoiceSpec {
  body: BodyMix;
  brightness: number;
  larynx: number;
  lipProt?: number;
  ring?: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Each part's voice for a voice tone in 0..1 (default 0.5). Five things move together, so a
 * small turn is clearly heard in every part:
 * - the body (the engine's female/child continuum: tract length, folds, formants);
 * - the fold brightness (how abruptly they close);
 * - the larynx height (tract length);
 * - lip rounding (the dark end's "covered" vowel);
 * - the singer's ring (the bright end's 3 kHz band, the epilarynx narrowed).
 *
 * At the default: soprano girl-like (child 0.45), alto a woman, tenor and bass men, plain. Dark
 * (0): an adult soprano, a fuller alto (female 0.7), lowered larynxes and rounded lips, soft
 * folds. Bright (1): child-like trebles (child 0.9 / 0.6), lighter men (female 0.4 / 0.15),
 * raised larynxes, crisp folds, half the ring. Both ends stay within what the engine sings
 * well (tests/choir.test.ts).
 *
 * The bass is the darkest and deepest at every setting: its larynx sits lower than anyone's
 * (−0.8 cm at the default: a longer tract, every formant lower), its lips rounder and its folds
 * softer, and the dial moves it half as far. Its notes are as written: deeper in timbre, not
 * transposed.
 */
export function voicesFor(tone: number): VoiceSpec[] {
  const s = 2 * (clamp(tone, 0, 1) - 0.5); // −1 dark … 1 bright
  const dn = Math.max(0, -s), up = Math.max(0, s);
  const upper = (body: BodyMix, lip: number, ring: number, lar: number): VoiceSpec => ({ body, brightness: 0.28 + 0.2 * s, larynx: -lar * dn + 0.3 * up, lipProt: lip * dn, ring: ring * up });
  return [
    upper({ female: 1, child: clamp(0.45 + 0.45 * s, 0, 1) }, 0.3, 0.4, 0.4),
    upper({ female: 1 - 0.3 * dn, child: 0.6 * up }, 0.5, 0.5, 0.6),
    upper({ female: 0.4 * up, child: 0 }, 0.5, 0.5, 0.6),
    { body: { female: 0.15 * up, child: 0 }, brightness: 0.1 + 0.08 * s, larynx: -0.8 - 0.3 * dn + 0.3 * up, lipProt: 0.4 + 0.2 * dn - 0.2 * up, ring: 0 },
  ];
}

/** each part's body for a voice tone (see voicesFor) */
export const bodiesFor = (tone: number): BodyMix[] => voicesFor(tone).map((v) => v.body);

/** gains: the four parts about equal on "lɑ" (raw levels 0.28-0.30, tests/choir.test.ts), the
 *  tune (soprano) a little on top */
const VOICES: { key: string; name: string; bodyName: string; gain: number }[] = [
  { key: "soprano", name: "Soprano", bodyName: "girl-like", gain: 0.28 },
  { key: "alto", name: "Alto", bodyName: "woman", gain: 0.22 },
  { key: "tenor", name: "Tenor", bodyName: "man", gain: 0.24 },
  { key: "bass", name: "Bass", bodyName: "man", gain: 0.27 },
];

export function choirParts(score: ChoirScore = SCORE, tone = TONE_DEFAULT): ChoirPart[] {
  const voices = voicesFor(tone);
  return VOICES.map((v, i) => {
    const notes = score.parts[v.key].notes;
    let entranceBeat = 0;
    for (const [midi, beats] of notes) {
      if (midi > 0) break;
      entranceBeat += beats;
    }
    return { ...v, body: voices[i].body, voice: voices[i], notes, entranceBeat };
  });
}

export const PARTS = choirParts();

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The index of `part`'s note sounding at `beat` (beats from the first beat; −1: a rest, or
 *  outside the song). */
export function noteAt(part: ChoirPart, beat: number): number {
  let b = 0;
  for (let i = 0; i < part.notes.length; i++) {
    const [midi, beats] = part.notes[i];
    if (beat >= b && beat < b + beats) return midi > 0 ? i : -1;
    b += beats;
  }
  return -1;
}

/** Is `part` sounding a note at `beat` (beats from the first beat)? */
export const singingAt = (part: ChoirPart, beat: number): boolean => noteAt(part, beat) >= 0;

/**
 * A run's timing from one moment on: run time `time` (s, frame / fs) is score beat `beat`, and
 * beats go by at `bpm`. A run starts with { time: T0, beat: 0 }; a tempo change while singing
 * adds an anchor at the frame it takes effect, at the beat the old timing had reached there, so
 * the beat carries on from where it was.
 */
export interface Timing {
  time: number;
  beat: number;
  bpm: number;
}

export const runTiming = (bpm: number): Timing => ({ time: T0, beat: 0, bpm });
export const timeAt = (a: Timing, beat: number) => a.time + ((beat - a.beat) * 60) / a.bpm;
export const beatAt = (a: Timing, time: number) => a.beat + ((time - a.time) * a.bpm) / 60;

/** The beat at run time `time` on a timeline (anchors in time order). */
export function beatOn(timeline: Timing[], time: number): number {
  let a = timeline[0];
  for (const x of timeline) if (x.time <= time) a = x;
  return beatAt(a, time);
}

/** beats from the first beat at sample `frame` of a run at `bpm` (one tempo throughout) */
export const beatAtFrame = (frame: number, fs: number, bpm: number) => beatAt(runTiming(bpm), frame / fs);

/**
 * Plan one part for an engine whose clock 0 is run time `start`: its notes from beat `fromBeat`
 * on (the note under `fromBeat` starts there, shortened), timed by `a`. Rests split the part into
 * phrases, each planned at its own start (as `chimera render notes`). The voice's larynx offset
 * goes onto every planned larynx target.
 */
export function planPart(part: ChoirPart, a: Timing, fromBeat = 0, start = 0, vibrato = 30): PartPlan {
  const v = part.voice;
  const gestures: Gesture[] = [];
  let end = 0;
  let phrase: SungNote[] = [];
  let phraseBeat = 0;
  const flush = () => {
    if (!phrase.length) return;
    const plan = planSong(phrase, { body: v.body, bpm: a.bpm, t0: timeAt(a, phraseBeat) - start, vibrato });
    for (const g of plan.gestures) {
      if (v.larynx && g.targets.larynx !== undefined) g.targets = { ...g.targets, larynx: clamp(g.targets.larynx + v.larynx, -1.6, 1.6) };
      if (v.lipProt && g.targets.lipProt !== undefined) g.targets = { ...g.targets, lipProt: clamp(g.targets.lipProt + v.lipProt, -0.2, 1.5) };
      gestures.push(g);
    }
    end = Math.max(end, plan.end);
    phrase = [];
  };
  let b = 0;
  let firstMidi = 0;
  for (const [midi, beats] of part.notes) {
    const nb = b + beats;
    const from = Math.max(b, fromBeat);
    // (a sliver of a note left before the cut is too short to sing: a rest)
    if (nb - from > 0.05) {
      if (midi > 0) {
        if (!phrase.length) phraseBeat = from;
        phrase.push({ midi, beats: nb - from, syl: LA });
        firstMidi ||= midi;
      } else flush();
    } else if (nb > fromBeat) flush();
    b = nb;
  }
  flush();
  firstMidi ||= part.notes.find((n) => n[0] > 0)?.[0] ?? 60;
  return { body: v.body, brightness: v.brightness, posture: v.ring ? { epilarynx: v.ring } : undefined, f0: midiToHz(firstMidi), start, gestures, end };
}

/** Plan every part from the top: the gestures each engine sings, all from the same time 0 and bpm. */
export function planChoir(parts: ChoirPart[] = PARTS, bpm = SCORE.bpm, vibrato = 30): PartPlan[] {
  return parts.map((p) => planPart(p, runTiming(bpm), 0, 0, vibrato));
}

export interface PartProgress {
  /** its first note has come */
  entered: boolean;
  /** a note of it is sounding now */
  singing: boolean;
  /** measured output level (RMS) */
  level: number;
}

interface ChoirState {
  /** the run playing (0: none) */
  run: number;
  /** waiting for audio or the parts' first samples */
  starting: boolean;
  /** beats since the first beat (−1: not started) */
  beat: number;
  parts: PartProgress[];
  /** the knobs: the next run's, and while singing applied live (see retune) */
  bpm: number;
  tone: number;
  /** the run's timing: one anchor per tempo (the latest last) */
  timeline: Timing[];
  error: string | null;
}

const idle = (): PartProgress[] => PARTS.map(() => ({ entered: false, singing: false, level: 0 }));

export const useChoir = create<ChoirState>(() => ({ run: 0, starting: false, beat: -1, parts: idle(), bpm: SCORE.bpm, tone: TONE_DEFAULT, timeline: [runTiming(SCORE.bpm)], error: null }));

/** 1-based bar for a beat (bar 1 before the start) */
export const barOf = (beat: number) => Math.min(BARS, Math.floor(Math.max(0, beat) / BEATS_PER_BAR) + 1);

/** bumped by every stop: a start still waiting for audio then gives up */
let token = 0;
/** what started the current run (audio startup), for a knob turned before anything sounds */
let lastReady: (() => Promise<void>) | undefined;
/** a knob change takes effect this far ahead of what is heard (s): time for the Workers to build
 *  and warm up the new engines before the mixer reaches it */
export const LEAD_S = 0.4;
/** the splice in flight (frame its crossfade is over), and whether a newer change waits for it */
let inflight: number | null = null;
let pending = false;

/** Where the run is, from the choir's shared clock. */
export function onProgress(r: ChoirProgress): void {
  const s = useChoir.getState();
  if (!s.run || r.run !== s.run) return;
  if (r.finished) {
    useChoir.setState({ run: 0, starting: false, beat: -1, parts: idle() });
    return;
  }
  if (!r.started) return;
  const beat = beatOn(s.timeline, r.time);
  const parts = PARTS.map((p, i) => ({ entered: beat >= p.entranceBeat, singing: singingAt(p, beat), level: r.levels[i] ?? 0 }));
  useChoir.setState({ starting: false, beat, parts });
  // a knob turned while the last change was still crossfading: apply it now
  if (pending && inflight !== null && r.frame >= inflight) retune();
}

choir.onReport(onProgress);

/**
 * What part `i` is singing now, for the words at its mouth: its note under the choir's clock
 * (the frame being heard), keyed by run and note so each new note is a new word. This is the
 * planned note timing on the shared clock; the head's mouth itself moves from the engine's
 * live telemetry.
 */
export function sungNow(i: number): { key: string; text: string } | null {
  const s = useChoir.getState();
  const f = choir.frameNow();
  if (!s.run || f === null) return null;
  const k = noteAt(PARTS[i], beatOn(s.timeline, f / choir.sampleRate));
  return k < 0 ? null : { key: `${s.run}:${k}`, text: LA.text };
}

/** Start the choir from bar 1 with the knobs' tempo and tone (after `ready`, e.g. audio startup,
 *  resolves; unless stopped meanwhile). */
export async function playChoir(ready?: () => Promise<void>): Promise<void> {
  stopChoir();
  const t = token;
  lastReady = ready;
  useChoir.setState({ starting: true, error: null });
  try {
    await ready?.();
    if (t !== token) return;
    const { bpm, tone } = useChoir.getState();
    const parts = choirParts(SCORE, tone);
    const plans = planChoir(parts, bpm);
    const run = choir.play(plans, parts.map((p) => p.gain));
    useChoir.setState({ run, starting: true, beat: -1, parts: idle(), timeline: [runTiming(bpm)] });
  } catch (err) {
    if (t !== token) return;
    useChoir.setState({ run: 0, starting: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Stop all four parts now. */
export function stopChoir(): void {
  token++;
  inflight = null;
  pending = false;
  choir.stop();
  useChoir.setState({ run: 0, starting: false, beat: -1, parts: idle() });
}

/**
 * Apply the knobs to the run singing, without going back: from frame `at` (LEAD_S after what is
 * heard now) each part continues on a new engine with the current tone's voice and the rest of
 * the song at the current tempo. The beat at `at` is the beat the run's timing had reached there,
 * so the song carries on from it: the new timing anchor maps that beat to `at` and goes on at the
 * new bpm. Each new plan starts WARM_S before `at` (its engine warms up muted) and the mixer
 * crossfades old into new over XFADE_S. Nothing heard yet (the first samples still buffering):
 * the run simply starts again with the new settings.
 */
export function retune(): void {
  const s = useChoir.getState();
  if (!s.run) return;
  const f = choir.frameNow();
  if (f === null) {
    void playChoir(lastReady);
    return;
  }
  const fs = choir.sampleRate;
  // one change at a time: a newer one waits for the last crossfade to finish
  if (inflight !== null && f < inflight) {
    pending = true;
    return;
  }
  pending = false;
  const at = Math.round(f + LEAD_S * fs);
  const tAt = at / fs;
  const beat = beatOn(s.timeline, tAt);
  // the last notes are already sounding out: nothing left to change
  if (beat >= SCORE.total_beats) return;
  const a: Timing = { time: tAt, beat, bpm: s.bpm };
  const start = tAt - WARM_S;
  const fromBeat = beatAt(a, start);
  const plans = choirParts(SCORE, s.tone).map((p) => planPart(p, a, fromBeat, start));
  choir.splice(plans, at);
  inflight = at + Math.round((XFADE_S + 0.05) * fs);
  useChoir.setState({ timeline: [...s.timeline.filter((x) => x.time < tAt), a] });
}

const singing = () => useChoir.getState().run !== 0;

/** Set the tempo knob (clamped, whole bpm). While singing it applies live from the current beat
 *  (retune); otherwise it is the next run's. */
export function setTempo(bpm: number): Promise<void> {
  useChoir.setState({ bpm: Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, bpm))) });
  if (singing()) retune();
  return Promise.resolve();
}

/** Set the voice-tone knob (0..1). While singing the four voices change live (retune); otherwise
 *  it is the next run's. */
export function setTone(tone: number): Promise<void> {
  useChoir.setState({ tone: Math.min(1, Math.max(0, tone)) });
  if (singing()) retune();
  return Promise.resolve();
}
