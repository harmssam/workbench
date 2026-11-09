/**
 * The four-part choir ("Carol of the Bells" = Leontovych's Shchedryk, SATB), without a browser.
 *
 * Audio: the parts are planned as the UI plans them (src/ui/choir.ts), each sung by its own
 * engine exactly as its Worker does (PartVoice) and streamed in 2048-sample chunks through the
 * worklet's mixer (ChoirMixer), whose per-part block levels are measured on the shared clock.
 * Control: play / stop / replay in src/ui/choir.ts against a stand-in for the choir engine.
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { initEngine, wasmModule } from "./harness.ts";
import { ChoirMixer } from "../src/worklet/choirMix.ts";
import { PartVoice } from "../src/worklet/choirPart.ts";
import type { PartPlan } from "../src/worklet/choirPart.ts";
import type { ChoirProgress } from "../src/audio/ChoirEngine.ts";

await initEngine();

// the choir engine needs a browser (AudioWorklet, Workers): a stand-in records what it is told
const calls: { play: { run: number; plans: PartPlan[]; gains: number[] }[]; stop: number; splice: { run: number; plans: PartPlan[]; at: number }[] } = { play: [], stop: 0, splice: [] };
let report: ((r: ChoirProgress) => void) | null = null;
let lastRun = 0;
const fakeChoir = {
  run: 0,
  /** the frame being heard (tests set it) */
  frame: null as number | null,
  sampleRate: 48000,
  frameNow() {
    return this.run ? this.frame : null;
  },
  teleNow: () => null,
  play(plans: PartPlan[], gains: number[]) {
    const run = ++lastRun;
    this.run = run;
    calls.play.push({ run, plans, gains });
    return run;
  },
  stop() {
    this.run = 0;
    this.frame = null;
    calls.stop++;
  },
  splice(plans: PartPlan[], at: number) {
    calls.splice.push({ run: this.run, plans, at });
    return calls.splice.length;
  },
  onReport(l: (r: ChoirProgress) => void) {
    report = l;
    return () => {};
  },
};
mock.module("../src/audio/ChoirEngine.ts", () => ({ choir: fakeChoir }));
/** how audio was started (the player starts the output bus without the solo voice) */
const audioStarts: unknown[] = [];
const engineStub = { start: (o: unknown) => (audioStarts.push(o), Promise.resolve()) } as Record<string, unknown>;
mock.module("../src/audio/AudioEngine.ts", () => ({ engine: new Proxy(engineStub, { get: (t, k) => (k in t ? t[k as string] : () => null) }) }));
const { voicesFor, LEAD_S, planPart, runTiming, timeAt, beatOn, choirParts } = await import("../src/ui/choir.ts");
const { PartStream, WARM_S, XFADE_S } = await import("../src/worklet/choirStream.ts");
const { PARTS, SCORE, T0, BARS, planChoir, playChoir, stopChoir, useChoir, barOf, bodiesFor, setTempo, setTone, TONE_DEFAULT, noteAt, beatAtFrame } = await import("../src/ui/choir.ts");
type ChoirPart = (typeof PARTS)[number];
const { CarolPlayer, togglePlay } = await import("../src/ui/CarolPlayer.tsx");
const { sungNow, LA } = await import("../src/ui/choir.ts");
const { TeleQueue } = await import("../src/audio/teleQueue.ts");
const { advanceTrail } = await import("../src/ui/mouthWords.ts");

const FS = 48000;
const BEAT = 60 / SCORE.bpm;
const [S, A, T, B] = [0, 1, 2, 3];

describe("choir score", () => {
  test("the whole validated SATB score: 3/4 at 112, 37 written bars with the repeat sung (205.5 beats), entrances S1 A5 T9 B13", () => {
    expect(SCORE.bpm).toBe(112);
    expect(SCORE.bars_written).toBe(37);
    expect(SCORE.total_beats).toBe(205.5);
    expect(BARS).toBe(69);
    expect(PARTS.map((p) => p.key)).toEqual(["soprano", "alto", "tenor", "bass"]);
    // every part runs to the final cadence: no once-through (111-beat) cut-off
    for (const p of PARTS) expect(p.notes.reduce((s, n) => s + n[1], 0)).toBe(205.5);
    for (const p of PARTS) expect(noteAt(p, 204.9)).toBeGreaterThanOrEqual(0);
    expect(PARTS.map((p) => p.entranceBeat)).toEqual([0, 12, 24, 36]);
    // soprano, alto: higher voices; tenor, bass: men
    expect(PARTS.map((p) => p.body.female)).toEqual([1, 1, 0, 0]);
  });
});

describe("four voices live, one clock", () => {
  // render to bar 16 (beat 48): past the bass's entrance at bar 13
  const UNTIL = T0 + 48 * BEAT;
  let plans: PartPlan[] = [];
  /** per 128-sample block: each part's level, and the mix */
  const levels: number[][] = [];
  const mixed: number[] = [];
  let peak = 0;
  beforeAll(() => {
    plans = planChoir();
    const voices = plans.map((p) => {
      const v = new PartVoice(wasmModule, FS);
      v.begin(p);
      return v;
    });
    const mix = new ChoirMixer();
    mix.begin(1, PARTS.map((p) => p.gain), 0.5 * FS);
    const out = new Float32Array(128);
    while (mix.frame < UNTIL * FS) {
      // the Workers stay ahead of the mixer
      for (let i = 0; i < 4; i++) while (voices[i].rendered - mix.frame < FS && !voices[i].done) mix.push(1, i, voices[i].render(2048), voices[i].done);
      if (!mix.render(out)) throw new Error(`mixer stalled at frame ${mix.frame}`);
      levels.push(mix.parts.map((p) => p.level));
      let e = 0;
      for (const v of out) {
        e += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      mixed.push(Math.sqrt(e / 128));
    }
  }, 180_000);
  const block = (t: number) => Math.floor((t * FS) / 128);
  /** mean level of each part between two beats */
  const mean = (b0: number, b1: number) => {
    const rows = levels.slice(block(T0 + b0 * BEAT), block(T0 + b1 * BEAT));
    return [0, 1, 2, 3].map((i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
  };
  const ON = 0.01;
  const OFF = 1e-4;
  const active = (m: number[]) => m.map((x) => (x > ON ? 1 : x < OFF ? 0 : NaN));

  test("each part's plan is all of its notes, from one time 0 and tempo", () => {
    for (const p of plans) expect(p.gestures.length).toBeGreaterThan(100);
    // every part's first gesture comes as far ahead of its own entrance (same syllable, same clock)
    const lead = plans.map((p, i) => T0 + PARTS[i].entranceBeat * BEAT - Math.min(...p.gestures.map((g) => g.t0)));
    for (const l of lead) expect(Math.abs(l - lead[0])).toBeLessThan(1e-6);
  });

  test("staggered entrances: S alone, then S+A, then S+A+T, then all four", () => {
    expect(active(mean(0.5, 11.5))).toEqual([1, 0, 0, 0]);
    expect(active(mean(12.5, 23.5))).toEqual([1, 1, 0, 0]);
    expect(active(mean(24.5, 35.5))).toEqual([1, 1, 1, 0]);
    expect(active(mean(36.5, 47.5))).toEqual([1, 1, 1, 1]);
  });

  test("the parts balance: none more than twice as loud as another in the full choir", () => {
    const m = mean(36.5, 47.5).map((x, i) => x * PARTS[i].gain);
    console.log("part levels × gain, bars 13-16:", m.map((x) => x.toFixed(3)).join(" "), "mix peak", peak.toFixed(3));
    expect(Math.max(...m) / Math.min(...m)).toBeLessThan(2);
  });

  test("after bar 13 all four sound at once, bar after bar", () => {
    for (let bar = 13; bar <= 16; bar++) {
      const b0 = (bar - 1) * 3;
      const m = mean(b0 + 0.25, b0 + 2.75);
      for (const x of m) expect(x).toBeGreaterThan(ON);
    }
    // and the mix is louder for it than the soprano alone was
    const mixMean = (b0: number, b1: number) => {
      const xs = mixed.slice(block(T0 + b0 * BEAT), block(T0 + b1 * BEAT));
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    expect(mixMean(37, 47)).toBeGreaterThan(1.5 * mixMean(1, 11));
    // and stays clear of clipping
    expect(peak).toBeLessThan(0.9);
  });

  test("shared clock: each part comes in on its own beat, all with the same offset", () => {
    // onset: the first block above a tenth of the part's level in its first bar (men are
    // louder than women, so a fixed threshold would come earlier for them)
    const onset = (i: number) => {
      const b = PARTS[i].entranceBeat;
      const thr = 0.1 * mean(b, b + 3)[i];
      return (levels.findIndex((r) => r[i] > thr) * 128) / FS;
    };
    const late = [S, A, T, B].map((i) => onset(i) - (T0 + PARTS[i].entranceBeat * BEAT));
    for (const d of late) {
      // the "l" starts a little before the beat
      expect(Math.abs(d)).toBeLessThan(0.15);
      expect(Math.abs(d - late[S])).toBeLessThan(0.01);
    }
  });
});

describe("the mixer", () => {
  const chunk = (n: number, v = 0.5) => new Float32Array(n).fill(v);

  test("waits for every part's preroll, then starts them all on frame 0", () => {
    const m = new ChoirMixer();
    const out = new Float32Array(128);
    m.begin(1, [1, 1], 256);
    m.push(1, 0, chunk(1024));
    expect(m.render(out)).toBe(false);
    expect(m.frame).toBe(0);
    m.push(1, 1, chunk(1024));
    expect(m.render(out)).toBe(true);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(m.frame).toBe(128);
  });

  test("a part short of samples holds every part back (no drift)", () => {
    const m = new ChoirMixer();
    const out = new Float32Array(128);
    m.begin(1, [1, 1], 0);
    m.push(1, 0, chunk(1024));
    m.push(1, 1, chunk(128));
    expect(m.render(out)).toBe(true);
    expect(m.render(out)).toBe(false);
    expect(m.parts.map((p) => p.buffered)).toEqual([896, 0]);
    m.push(1, 1, chunk(128));
    expect(m.render(out)).toBe(true);
    expect(m.frame).toBe(256);
  });

  test("stop silences every part, and late samples of the stopped run stay out", () => {
    const m = new ChoirMixer();
    const out = new Float32Array(128);
    m.begin(1, [1, 1, 1, 1], 0);
    for (let i = 0; i < 4; i++) m.push(1, i, chunk(4096));
    expect(m.render(out)).toBe(true);
    m.stop();
    for (let i = 0; i < 4; i++) m.push(1, i, chunk(4096));
    expect(m.render(out)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
    expect(m.parts.length).toBe(0);
  });

  test("replay starts the new run from frame 0, even when its samples beat its begin", () => {
    const m = new ChoirMixer();
    const out = new Float32Array(128);
    m.begin(1, [1, 1], 0);
    m.push(1, 0, chunk(4096, 0.1));
    m.push(1, 1, chunk(4096, 0.1));
    for (let k = 0; k < 10; k++) m.render(out);
    expect(m.frame).toBe(1280);
    m.stop();
    // run 2's first chunks get here before its begin
    m.push(2, 0, chunk(1024, 0.25));
    m.push(2, 1, chunk(1024, 0.25));
    m.push(1, 0, chunk(1024, 0.1)); // stale
    m.begin(2, [1, 1], 512);
    expect(m.frame).toBe(0);
    expect(m.render(out)).toBe(true);
    expect(out[0]).toBeCloseTo(0.5, 6);
  });
});

describe("play, stop, replay", () => {
  const progress = (run: number, beat: number, finished = false): ChoirProgress => ({ type: "choir", run, frame: 0, time: T0 + beat * BEAT, started: true, finished, levels: [0.1, 0.1, 0.1, 0.1] });

  test("play sends all four parts at once, with one time 0 and tempo", async () => {
    await playChoir();
    expect(calls.play.length).toBe(1);
    const { run, plans, gains } = calls.play[0];
    expect(plans.length).toBe(4);
    expect(gains.length).toBe(4);
    expect(useChoir.getState().run).toBe(run);
    // the part progress follows the shared clock
    report!(progress(run, 13));
    expect(useChoir.getState().parts.map((p) => p.entered)).toEqual([true, true, false, false]);
    report!(progress(run, 40));
    expect(useChoir.getState().parts.map((p) => p.entered)).toEqual([true, true, true, true]);
    expect(barOf(useChoir.getState().beat)).toBe(14);
  });

  test("stop cancels all four voices; nothing of that run comes back", async () => {
    const run = useChoir.getState().run;
    const before = calls.stop;
    stopChoir();
    expect(calls.stop).toBe(before + 1);
    expect(fakeChoir.run).toBe(0);
    expect(useChoir.getState().run).toBe(0);
    report!(progress(run, 50));
    expect(useChoir.getState().beat).toBe(-1);
    expect(useChoir.getState().parts.every((p) => !p.entered && !p.singing)).toBe(true);
  });

  test("a stop while audio is starting cancels the start", async () => {
    let go = () => {};
    const n = calls.play.length;
    const waiting = playChoir(() => new Promise<void>((r) => (go = r)));
    stopChoir();
    go();
    await waiting;
    expect(calls.play.length).toBe(n);
    expect(useChoir.getState().run).toBe(0);
  });

  test("replay resets the progress and starts again from bar 1", async () => {
    await playChoir();
    const first = useChoir.getState().run;
    report!(progress(first, 60.5));
    expect(barOf(useChoir.getState().beat)).toBe(21);
    const stops = calls.stop;
    await playChoir();
    const second = useChoir.getState().run;
    expect(calls.stop).toBe(stops + 1); // the old run was cancelled first
    expect(second).toBeGreaterThan(first);
    expect(useChoir.getState().beat).toBe(-1);
    expect(useChoir.getState().parts.every((p) => !p.entered)).toBe(true);
    // the old run's reports no longer move anything
    report!(progress(first, 70));
    expect(useChoir.getState().beat).toBe(-1);
    report!(progress(second, 0.5));
    expect(barOf(useChoir.getState().beat)).toBe(1);
    expect(useChoir.getState().parts.map((p) => p.entered)).toEqual([true, false, false, false]);
    // the same plans as the first run
    const [a, b] = calls.play.slice(-2);
    expect(b.plans.map((p) => p.gestures.length)).toEqual(a.plans.map((p) => p.gestures.length));
    // the end of the run frees the choir
    report!(progress(second, 112, true));
    expect(useChoir.getState().run).toBe(0);
  });
});

describe("the player: Play / Stop, tempo and tone knobs", () => {
  const progress = (run: number, beat: number, bpm: number): ChoirProgress => ({ type: "choir", run, frame: 0, time: T0 + (beat * 60) / bpm, started: true, finished: false, levels: [0.1, 0.1, 0.1, 0.1] });
  /** the time each part's last gesture ends: the run's length at its tempo */
  const lastEnd = (plans: PartPlan[]) => Math.max(...plans.map((p) => p.end));

  test("the page is only the player: title, Play, two knobs; no modes, keys or panels", async () => {
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToString(createElement(CarolPlayer));
    expect(html).toContain("Carol of the Bells");
    expect(html).toContain("Shchedryk");
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain(">Play<");
    expect(html.match(/type="range"/g)?.length).toBe(2);
    for (const gone of ["Speak", "Bestiary", "Beatbox", "Piano roll", "Vocal tract", "Keys"]) expect(html).not.toContain(gone);
    // and it is what the page mounts
    const mount = await Bun.file(new URL("../src/ui/mount.tsx", import.meta.url)).text();
    expect(mount).toContain("<CarolPlayer />");
    expect(mount).not.toContain("<App />");
  });

  test("Play starts all four voices (audio without the solo voice); Stop cancels all; Play again replays from bar 1", async () => {
    stopChoir();
    const n = calls.play.length;
    await togglePlay();
    expect(calls.play.length).toBe(n + 1);
    expect(audioStarts.at(-1)).toEqual({ voice: false });
    const first = useChoir.getState().run;
    expect(calls.play.at(-1)!.plans.length).toBe(4);
    report!(progress(first, 45, SCORE.bpm));
    expect(useChoir.getState().parts.map((p) => p.entered)).toEqual([true, true, true, true]);
    const stops = calls.stop;
    await togglePlay(); // Stop
    expect(calls.stop).toBe(stops + 1);
    expect(useChoir.getState().run).toBe(0);
    expect(fakeChoir.run).toBe(0);
    await togglePlay(); // Play again
    const second = useChoir.getState().run;
    expect(second).toBeGreaterThan(first);
    expect(useChoir.getState().beat).toBe(-1);
    report!(progress(second, 1, SCORE.bpm));
    expect(barOf(useChoir.getState().beat)).toBe(1);
    expect(useChoir.getState().parts.map((p) => p.entered)).toEqual([true, false, false, false]);
    stopChoir();
  });

  test("tempo when stopped: the next run is timed by the knob's bpm", async () => {
    await setTempo(SCORE.bpm);
    await playChoir();
    const at112 = calls.play.at(-1)!.plans;
    stopChoir();
    await setTempo(84); // stopped: only remembered
    expect(useChoir.getState().run).toBe(0);
    await playChoir();
    const at84 = calls.play.at(-1)!.plans;
    // 205.5 beats from the same time 0: the song is 112/84 as long
    expect((lastEnd(at84) - T0) / (lastEnd(at112) - T0)).toBeCloseTo(112 / 84, 1);
    // the alto still comes in on beat 12 of the slower tempo
    const firstAlto = (plans: PartPlan[]) => Math.min(...plans[1].gestures.map((g) => g.t0));
    const lead = T0 + 12 * (60 / 112) - firstAlto(at112);
    expect(T0 + 12 * (60 / 84) - firstAlto(at84)).toBeCloseTo(lead, 2);
    // progress reads the run's own tempo
    const run = useChoir.getState().run;
    report!(progress(run, 13, 84));
    expect(barOf(useChoir.getState().beat)).toBe(5);
    // the knob stays in range
    await setTempo(500);
    expect(useChoir.getState().bpm).toBe(140);
    stopChoir();
    await setTempo(SCORE.bpm);
  });

  test("tempo while singing: no restart; the beat carries on from where it was, at the new bpm", async () => {
    await setTempo(112);
    await playChoir();
    const run = useChoir.getState().run;
    const plays = calls.play.length, stops = calls.stop, splices = calls.splice.length;
    // bar 20 is being heard
    const heard = T0 + 57.5 * (60 / 112);
    fakeChoir.frame = Math.round(heard * FS);
    report!(progress(run, 57.5, 112));
    await setTempo(90);
    // the same run: nothing stopped or started over
    expect(calls.play.length).toBe(plays);
    expect(calls.stop).toBe(stops);
    expect(useChoir.getState().run).toBe(run);
    expect(calls.splice.length).toBe(splices + 1);
    const { plans, at } = calls.splice.at(-1)!;
    // the change lands LEAD_S after what is heard, at the beat the old tempo reaches there
    expect(at).toBe(Math.round(fakeChoir.frame + LEAD_S * FS));
    const tAt = at / FS;
    const B = 57.5 + ((tAt - heard) * 112) / 60;
    const tl = useChoir.getState().timeline;
    expect(tl.at(-1)!.beat).toBeCloseTo(B, 6);
    expect(tl.at(-1)!.bpm).toBe(90);
    // progress: continuous through the change, then 90 bpm
    const beatAtT = (t: number) => {
      report!({ type: "choir", run, frame: Math.round(t * FS), time: t, started: true, finished: false, levels: [0.1, 0.1, 0.1, 0.1] });
      return useChoir.getState().beat;
    };
    expect(beatAtT(tAt - 0.001)).toBeCloseTo(B - (0.001 * 112) / 60, 4);
    expect(beatAtT(tAt)).toBeCloseTo(B, 6);
    expect(beatAtT(tAt + 2)).toBeCloseTo(B + 3, 6); // 2 s at 90 bpm
    expect(barOf(useChoir.getState().beat)).toBeGreaterThanOrEqual(20); // not back to bar 1
    // the new plans: the rest of the song at 90 bpm, each engine warming up from WARM_S before `at`
    for (let i = 0; i < 4; i++) {
      expect(plans[i].start).toBeCloseTo(tAt - WARM_S, 6);
      // the last note ends at beat ~205.5 of the new timing (engine clock = run time − start)
      const endBeat = B + ((plans[i].end + plans[i].start - tAt) * 90) / 60;
      expect(endBeat).toBeGreaterThan(204.9);
      expect(endBeat).toBeLessThan(206.5);
      // no note before the warm-up (nothing re-sung from earlier bars)
      expect(Math.min(...plans[i].gestures.map((g) => g.t0))).toBeGreaterThanOrEqual(-0.2);
    }
    stopChoir();
    await setTempo(SCORE.bpm);
  });

  test("a second turn while the first is still crossfading waits for it, then applies (no pile-up)", async () => {
    await playChoir();
    const run = useChoir.getState().run;
    fakeChoir.frame = Math.round((T0 + 30 * BEAT) * FS);
    report!(progress(run, 30, 112));
    const n = calls.splice.length;
    await setTempo(100);
    await setTempo(120); // within the first change's lead: waits
    expect(calls.splice.length).toBe(n + 1);
    // the first change's crossfade is over: the waiting one goes
    const after = calls.splice.at(-1)!.at + Math.round(0.2 * FS);
    fakeChoir.frame = after;
    report!({ type: "choir", run, frame: after, time: after / FS, started: true, finished: false, levels: [0.1, 0.1, 0.1, 0.1] });
    expect(calls.splice.length).toBe(n + 2);
    expect(useChoir.getState().timeline.at(-1)!.bpm).toBe(120);
    expect(useChoir.getState().run).toBe(run);
    stopChoir();
    await setTempo(SCORE.bpm);
  });

  test("voice tone: the knob moves every part's voice; while singing, live (no restart) from the current beat", async () => {
    expect(bodiesFor(TONE_DEFAULT)).toEqual(PARTS.map((p) => p.body));
    const dark = bodiesFor(0), bright = bodiesFor(1);
    // brighter: younger trebles, lighter men; darker: an adult soprano. Always S, A higher voices.
    expect(dark.map((b) => b.child)).toEqual([0, 0, 0, 0]);
    expect(bright[0].child).toBeGreaterThan(PARTS[0].body.child);
    expect(bright[1].child).toBeGreaterThan(0);
    expect(bright[2].female).toBeGreaterThan(0);
    expect(bright[2].female).toBeLessThan(0.5);
    for (const b of [...dark, ...bright]) for (const v of [b.female, b.child]) expect(v >= 0 && v <= 1).toBe(true);

    await setTone(1);
    await playChoir();
    const run = useChoir.getState().run;
    expect(calls.play.at(-1)!.plans.map((p) => p.body)).toEqual(bright);
    fakeChoir.frame = Math.round((T0 + 40 * BEAT) * FS);
    report!(progress(run, 40, 112));
    const plays = calls.play.length, stops = calls.stop;
    await setTone(0);
    // not restarted: the same run goes on, its parts handed to engines with the dark voices
    expect(calls.play.length).toBe(plays);
    expect(calls.stop).toBe(stops);
    expect(useChoir.getState().run).toBe(run);
    const sp = calls.splice.at(-1)!;
    expect(sp.plans.map((p) => p.body)).toEqual(dark);
    expect(sp.plans.map((p) => p.brightness)).toEqual(voicesFor(0).map((v) => v.brightness));
    // same tempo: the timeline's beat at the change is the old beat
    const tl = useChoir.getState().timeline.at(-1)!;
    expect(tl.bpm).toBe(112);
    expect(tl.beat).toBeCloseTo(40 + (LEAD_S * 112) / 60, 4);
    stopChoir();
    await setTone(TONE_DEFAULT);
  });
});

/** `part` from beat `b0` on (a note under b0 becomes a rest up to the next note), as its own part */
function fromBeat(part: ChoirPart, b0: number): ChoirPart {
  const notes: [number, number][] = [];
  let b = 0;
  for (const [midi, beats] of part.notes) {
    if (b + beats > b0) notes.push(b >= b0 ? [midi, beats] : [0, b + beats - b0]);
    b += beats;
  }
  let entranceBeat = 0;
  for (const [midi, beats] of notes) {
    if (midi > 0) break;
    entranceBeat += beats;
  }
  return { ...part, notes, entranceBeat };
}

describe("the ending", () => {
  /** the final cadence: bars 65 to the end (beats 192-205.5), sung and mixed as in the browser */
  const B0 = 192;
  const tail = PARTS.map((p) => fromBeat(p, B0));
  const lastNote = tail.map((p) => {
    let b = 0, start = 0, end = 0;
    for (const [midi, beats] of p.notes) {
      if (midi > 0) [start, end] = [b, b + beats];
      b += beats;
    }
    return { start, end };
  });
  const sec = (beat: number) => T0 + beat * BEAT;
  let plans: PartPlan[] = [];
  const levels: number[][] = [];
  const mixed: number[] = [];
  let totals: number[] = [];
  let finishedAt = -1;
  let stalled = false;

  beforeAll(() => {
    plans = planChoir(tail);
    const voices = plans.map((p) => {
      const v = new PartVoice(wasmModule, FS);
      v.begin(p);
      return v;
    });
    totals = voices.map((v) => v.total);
    const mix = new ChoirMixer();
    mix.begin(1, tail.map((p) => p.gain), 0.5 * FS);
    const out = new Float32Array(128);
    while (!mix.finished) {
      for (let i = 0; i < 4; i++) while (voices[i].rendered - mix.frame < FS && !voices[i].done) mix.push(1, i, voices[i].render(2048), voices[i].done);
      if (!mix.render(out)) {
        if (mix.finished) break;
        stalled = true;
        break;
      }
      levels.push(mix.parts.map((p) => p.level));
      let e = 0;
      for (const v of out) e += v * v;
      mixed.push(Math.sqrt(e / 128));
    }
    finishedAt = mix.frame;
  }, 120_000);

  const block = (t: number) => Math.floor((t * FS) / 128);
  const meanOf = (i: number, t0: number, t1: number) => {
    const rows = levels.slice(block(t0), block(t1));
    return rows.reduce((s, r) => s + r[i], 0) / rows.length;
  };

  test("each part's final notes are planned to their written end", () => {
    for (let i = 0; i < 4; i++) {
      // the last note ends on the last beat (205 or 205.5), and the plan reaches it
      expect(B0 + lastNote[i].end).toBeGreaterThanOrEqual(205);
      expect(plans[i].end).toBeGreaterThanOrEqual(sec(lastNote[i].end) - 0.06);
      expect(Math.max(...plans[i].gestures.map((g) => g.t1))).toBeGreaterThanOrEqual(sec(lastNote[i].start));
    }
  });

  test("every part sings its last note, then releases it to silence before the stream ends (no hard cut)", () => {
    expect(stalled).toBe(false);
    for (let i = 0; i < 4; i++) {
      const { start, end } = lastNote[i];
      const during = meanOf(i, sec(start) + 0.05, sec(end) - 0.02);
      expect(during).toBeGreaterThan(0.01);
      // the part's stream goes on past the note (the release is rendered, not dropped)
      expect(totals[i] / FS - sec(end)).toBeGreaterThan(0.3);
      // and has died away by its last samples
      const lastBlocks = levels.slice(Math.floor(totals[i] / 128) - 4, Math.floor(totals[i] / 128)).map((r) => r[i]);
      expect(Math.max(...lastBlocks)).toBeLessThan(0.02 * during);
    }
    const loud = Math.max(...mixed.slice(block(sec(lastNote[0].start)), block(sec(lastNote[0].end))));
    expect(Math.max(...mixed.slice(-8))).toBeLessThan(0.02 * loud);
  });

  test("the mixer plays every part to its end before it is finished (no early disposal)", () => {
    expect(finishedAt).toBe(Math.ceil(Math.max(...totals) / 128) * 128);
  });

  test("a natural end leaves the player idle; Play then starts again from bar 1", async () => {
    await playChoir();
    const run = useChoir.getState().run;
    report!({ type: "choir", run, frame: 0, time: sec(205), started: true, finished: false, levels: [0.1, 0.1, 0.1, 0.1] });
    expect(barOf(useChoir.getState().beat)).toBe(69);
    report!({ type: "choir", run, frame: 0, time: sec(206.5), started: true, finished: true, levels: [0, 0, 0, 0] });
    expect(useChoir.getState().run).toBe(0);
    expect(useChoir.getState().starting).toBe(false);
    expect(useChoir.getState().beat).toBe(-1);
    await playChoir();
    expect(useChoir.getState().run).toBeGreaterThan(run);
    expect(useChoir.getState().beat).toBe(-1);
    stopChoir();
  });

  test("Stop during the final cadence silences all four on the next block", () => {
    const voices = planChoir(tail).map((p) => {
      const v = new PartVoice(wasmModule, FS);
      v.begin(p);
      return v;
    });
    const mix = new ChoirMixer();
    mix.begin(7, tail.map((p) => p.gain), 0);
    const out = new Float32Array(128);
    const until = sec(lastNote[0].start) + 0.1;
    let loud = 0;
    while (mix.frame < until * FS) {
      for (let i = 0; i < 4; i++) while (voices[i].rendered - mix.frame < 4096 && !voices[i].done) mix.push(7, i, voices[i].render(2048), voices[i].done);
      mix.render(out);
      loud = Math.max(...out.map(Math.abs));
    }
    expect(loud).toBeGreaterThan(0.01);
    mix.stop();
    // the Workers' chunks already in flight arrive after the stop
    for (let i = 0; i < 4; i++) mix.push(7, i, voices[i].render(2048));
    expect(mix.render(out)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  }, 60_000);

  test("the whole song is timed through to beat 205.5 across the tempo range", () => {
    for (const bpm of [80, 112, 140]) {
      const ps = planChoir(PARTS, bpm);
      const end = T0 + (205.5 * 60) / bpm;
      for (const p of ps) {
        expect(p.end).toBeGreaterThan(T0 + (205 * 60) / bpm - 0.06);
        expect(p.end).toBeLessThan(end + 1);
      }
      // the progress clock reads the run's tempo: the last frame of the song is bar 69
      expect(barOf(beatAtFrame(end * FS - 1, FS, bpm))).toBe(69);
    }
  }, 60_000);
});

describe("the heads", () => {
  test("each part's engine gives its live airway: the mouth closes for /l/ and opens for /ɑ/, read every 1024 samples", () => {
    const [plan] = planChoir([PARTS[0]]);
    const v = new PartVoice(wasmModule, FS);
    v.begin(plan);
    const q = new TeleQueue();
    // the first two bars, as the Worker does it
    while (v.rendered < (T0 + 6 * BEAT) * FS) {
      v.render(1024);
      q.push(v.rendered, v.telemetry());
    }
    expect(q.size).toBeGreaterThan(100);
    // the narrowest oral area through the run: near closed on the "l"s, wide on the vowels
    const minOral: number[] = [];
    const voiced: number[] = [];
    for (let f = 1024; f <= v.rendered; f += 1024) {
      const t = q.at(f)!;
      minOral.push(Math.min(...t.orAreas));
      voiced.push(t.voicing);
    }
    expect(Math.max(...minOral)).toBeGreaterThan(4 * Math.min(...minOral));
    expect(Math.max(...voiced)).toBeGreaterThan(0.5);
    // a reading belongs to the frame it was taken at: never one from ahead of the playhead
    const q2 = new TeleQueue();
    const fake = (n: number) => ({ ...q.at(Infinity)!, clock: n });
    q2.push(1024, fake(1));
    q2.push(2048, fake(2));
    expect(q2.at(1000)).toBeNull();
    expect(q2.at(2047)!.clock).toBe(1);
    expect(q2.at(5000)!.clock).toBe(2);
    q2.clear();
    expect(q2.at(5000)).toBeNull();
  }, 60_000);

  test("the word at each mouth is the “la” sounding on the shared clock, a new one per note, gone on stop", async () => {
    expect(LA.text).toBe("la");
    await playChoir();
    const frameOf = (beat: number) => Math.round((T0 + beat * BEAT) * FS);
    fakeChoir.frame = frameOf(0.25);
    const s0 = sungNow(0);
    expect(s0?.text).toBe("la");
    expect([1, 2, 3].map((i) => sungNow(i))).toEqual([null, null, null]); // not in yet
    fakeChoir.frame = frameOf(1.25);
    expect(sungNow(0)!.key).not.toBe(s0!.key);
    fakeChoir.frame = frameOf(36.25);
    expect([0, 1, 2, 3].map((i) => sungNow(i)?.text)).toEqual(["la", "la", "la", "la"]);
    stopChoir();
    expect([0, 1, 2, 3].map((i) => sungNow(i))).toEqual([null, null, null, null]);
  });

  test("the floating words stay bounded and clear after a stop", () => {
    const trail = { entries: [] as { word: { key: unknown; text: string }; left: number | null }[] };
    // a fast run: a new note every 20 ms
    for (let k = 0; k < 100; k++) advanceTrail(trail, { key: k, text: "la" }, k * 0.02);
    expect(trail.entries.length).toBeLessThanOrEqual(8);
    // stop: nothing sung; after the fade nothing is left
    advanceTrail(trail, null, 2.0);
    advanceTrail(trail, null, 3.0);
    expect(trail.entries.length).toBe(0);
  });

  test("2×2: soprano, alto on top; tenor, bass below; never wider than the page", async () => {
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { default: ChoirHeads } = await import("../src/ui/ChoirHeads.tsx");
    const html = renderToString(createElement(ChoirHeads));
    expect(html.match(/<figure/g)?.length).toBe(4);
    const names = [...html.matchAll(/<figcaption><span>(\w+)<\/span>/g)].map((m) => m[1]);
    expect(names).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    const css = await Bun.file(new URL("../src/ui/heads.css", import.meta.url)).text();
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    // no other column count for any screen width
    expect(css).not.toContain("@media");
    // controls stay outside the grid
    const player = renderToString(createElement(CarolPlayer));
    // (the heads, or their stand-in list while the 3D code loads)
    const grid = Math.max(player.indexOf('class="heads"'), player.indexOf('class="parts"'));
    expect(grid).toBeGreaterThan(0);
    expect(player.indexOf(">Play<")).toBeLessThan(grid);
    expect(player.indexOf('type="range"')).toBeGreaterThan(grid);
  });
});

/** a part of its own: `notes` sung with `voice` */
const solo = (notes: [number, number][], voice: ReturnType<typeof voicesFor>[number]): ChoirPart => ({ ...PARTS[0], body: voice.body, voice, notes, entranceBeat: 0 });

/** Sing `part` alone at 48 kHz through a PartStream and the mixer; `splice` hands it over at frame `at`. */
function singAlone(part: ChoirPart, until: number, splice?: { at: number; plan: PartPlan }) {
  const st = new PartStream(wasmModule, FS);
  st.begin(planChoir([part])[0]);
  const mix = new ChoirMixer(FS);
  mix.begin(1, [1], 0);
  const out: number[] = [];
  /** narrowest oral area per telemetry reading (the "l" closes the tongue tip) */
  const oral: { frame: number; min: number }[] = [];
  const tele = (frame: number, t: { orAreas: Float32Array }) => oral.push({ frame, min: Math.min(...t.orAreas) });
  const buf = new Float32Array(128);
  let spliced = false;
  while (mix.frame < until * FS) {
    if (splice && !spliced && st.frame >= splice.at - 4096) {
      for (const o of st.splice(1, splice.plan, splice.at, tele)) o.kind === "splice" ? mix.splice(1, 0, o.at) : mix.push(1, 0, o.chunk, o.done);
      spliced = true;
    }
    while (st.frame - mix.frame < 4096 && !st.done) {
      const o = st.next(1024, tele);
      if (o.kind === "chunk") mix.push(1, 0, o.chunk, o.done);
    }
    if (!mix.render(buf)) throw new Error(`mixer stalled at ${mix.frame}`);
    out.push(...buf);
  }
  return { out: Float32Array.from(out), oral };
}

/** spectral centroid (Hz, 80 Hz–5 kHz) of `x` around `t` (s), Hann-windowed DFT */
function centroid(x: Float32Array, t: number): number {
  const N = 2048, i0 = Math.round(t * FS) - N / 2;
  let num = 0, den = 0;
  for (let k = Math.ceil((80 * N) / FS); k <= Math.floor((5000 * N) / FS); k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
      const v = x[i0 + n] * w;
      re += v * Math.cos((2 * Math.PI * k * n) / N);
      im -= v * Math.sin((2 * Math.PI * k * n) / N);
    }
    const p = re * re + im * im;
    num += p * ((k * FS) / N);
    den += p;
  }
  return num / den;
}

/** one sustained "la", its voice settled: centroid in mid-vowel, and its pitch */
function sustained(midi: number, voice: ReturnType<typeof voicesFor>[number]) {
  const { out } = singAlone(solo([[midi, 3]], voice), T0 + 3 * BEAT);
  const mid = T0 + 1.6 * BEAT;
  return { centroid: (centroid(out, mid - 0.15) + centroid(out, mid) + centroid(out, mid + 0.15)) / 3, out };
}

describe("live knobs: the engines change mid-song", () => {
  const sop = PARTS[0];
  const a0 = runTiming(112);

  test("tone while singing: the soprano hands over to its new voice mid-vowel with no gap and no click", () => {
    // mid-vowel of the note on beat 3 (1 beat long)
    const at = Math.round(timeAt(a0, 3.5) * FS);
    const tAt = at / FS;
    const a = { time: tAt, beat: 3.5, bpm: 112 };
    const start = tAt - WARM_S;
    const bright = choirParts(SCORE, 1)[0];
    const plan = planPart(bright, a, beatOn([a], start), start);
    const { out } = singAlone(sop, tAt + 0.6, { at, plan });
    const xf = Math.round(XFADE_S * FS);
    const rms = (i0: number, i1: number) => Math.sqrt(out.slice(i0, i1).reduce((s, v) => s + v * v, 0) / (i1 - i0));
    const before = rms(at - 4800, at);
    // no gap: every 5 ms through the crossfade and just after it keeps most of the level
    for (let i = at - 240; i < at + xf + 960; i += 240) expect(rms(i, i + 240)).toBeGreaterThan(0.5 * before);
    // no click: the steepest sample step around the hand-over is like the vowel's own
    const slope = (i0: number, i1: number) => {
      let m = 0;
      for (let i = i0 + 1; i < i1; i++) m = Math.max(m, Math.abs(out[i] - out[i - 1]));
      return m;
    };
    expect(slope(at - 128, at + xf + 128)).toBeLessThan(1.6 * slope(at - 9600, at - 128));
  }, 60_000);

  test("tempo while singing: the soprano's next notes come on their beats at the new tempo, from the same beat", () => {
    const B = 3.5;
    const at = Math.round(timeAt(a0, B) * FS);
    const tAt = at / FS;
    const a = { time: tAt, beat: B, bpm: 84 };
    const start = tAt - WARM_S;
    const plan = planPart(sop, a, beatOn([a], start), start);
    const { oral } = singAlone(sop, timeAt(a, 7.2), { at, plan });
    /** time of the tongue-tip closure ("l") nearest `t` */
    const lAt = (t: number) => {
      const near = oral.filter((o) => Math.abs(o.frame / FS - t) < 0.15);
      return near.reduce((m, o) => (o.min < m.min ? o : m)).frame / FS;
    };
    // where the "l" falls against its beat, measured before the change (beats 1, 2, 3)
    const lead = [1, 2, 3].map((b) => lAt(timeAt(a0, b)) - timeAt(a0, b));
    const d = lead.reduce((s, x) => s + x, 0) / lead.length;
    // after it, beats 4, 4.5, 5 and 6 at 84 bpm from beat 3.5 (at 112 they would be 90-360 ms earlier)
    for (const b of [4, 4.5, 5, 6]) {
      expect(Math.abs(lAt(timeAt(a, b)) - (timeAt(a, b) + d))).toBeLessThan(0.035);
      expect(Math.abs(timeAt(a, b) - timeAt(a0, b))).toBeGreaterThan(0.08);
    }
  }, 60_000);

  test("bass: darker and deeper than the tenor on the same written note, still at its pitch (not an octave down)", () => {
    const [, , tenor, bass] = voicesFor(TONE_DEFAULT);
    // G3 (55), in both parts' range
    const t = sustained(55, tenor), b = sustained(55, bass);
    expect(b.centroid).toBeLessThan(0.92 * t.centroid);
    // the bass part's notes are the score's (no transposition)
    expect(PARTS[3].notes).toEqual(SCORE.parts.bass.notes);
    // and it sings them at pitch: the plan starts the folds on the written note
    const [plan] = planChoir([PARTS[3]]);
    const first = SCORE.parts.bass.notes.find((n) => n[0] > 0)![0];
    expect(plan.f0).toBeCloseTo(440 * Math.pow(2, (first - 69) / 12), 6);
    // darkest at every tone setting
    for (const tone of [0, 0.25, 0.5, 0.75, 1]) {
      const v = voicesFor(tone);
      expect(v[3].larynx).toBeLessThan(Math.min(v[0].larynx, v[1].larynx, v[2].larynx));
      expect(v[3].brightness).toBeLessThan(Math.min(v[0].brightness, v[1].brightness, v[2].brightness));
      expect(v[3].body.female).toBeLessThanOrEqual(v[2].body.female);
    }
  }, 120_000);

  test("voice tone is sensitive: each quarter turn audibly changes every part (the bass by half), twice the old dial; both ends sing well", () => {
    /** a part's steady "la" as third-octave band levels (dB), 100 Hz–5 kHz */
    const bands = (out: Float32Array) => {
      const N = 4096, mid = Math.round((T0 + 1.6 * BEAT) * FS) - N / 2;
      const pw = new Float64Array(N / 2);
      for (const off of [-4800, 0, 4800]) {
        const i0 = mid + off;
        for (let k = 1; k < N / 2; k++) {
          const f = (k * FS) / N;
          if (f < 89 || f > 5600) continue;
          let re = 0, im = 0;
          for (let n = 0; n < N; n += 1) {
            const v = out[i0 + n] * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
            re += v * Math.cos((2 * Math.PI * k * n) / N);
            im -= v * Math.sin((2 * Math.PI * k * n) / N);
          }
          pw[k] += re * re + im * im;
        }
      }
      const levels: number[] = [];
      for (let c = 100; c <= 5000; c *= 2 ** (1 / 3)) {
        let e = 1e-12;
        for (let k = 1; k < N / 2; k++) {
          const f = (k * FS) / N;
          if (f >= c / 2 ** (1 / 6) && f < c * 2 ** (1 / 6)) e += pw[k];
        }
        levels.push(10 * Math.log10(e));
      }
      // timbre, not loudness: relative to the band mean
      const m = levels.reduce((a, b) => a + b, 0) / levels.length;
      return levels.map((l) => l - m);
    };
    /** RMS difference (dB) between two band spectra */
    const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0) / a.length);
    const NOTES = [70, 64, 58, 50]; // a note in each part's range: Bb4, E4, Bb3, D3
    const tones = [0, 0.25, 0.5, 0.75, 1];
    const spectra = NOTES.map((m, i) =>
      tones.map((t) => {
        const { out } = singAlone(solo([[m, 3]], voicesFor(t)[i]), T0 + 3 * BEAT);
        const mid = out.slice(Math.round((T0 + BEAT) * FS), Math.round((T0 + 2.5 * BEAT) * FS));
        const r = Math.sqrt(mid.reduce((s, v) => s + v * v, 0) / mid.length);
        // both ends: a healthy level, nothing blown up
        expect(r).toBeGreaterThan(0.05);
        expect(Math.max(...mid.map(Math.abs))).toBeLessThan(1);
        return bands(out);
      }),
    );
    // every quarter turn moves every part's spectrum by at least 1 dB (band RMS)
    const steps = spectra.map((sp) => sp.slice(1).map((b, k) => dist(b, sp[k])));
    // the old dial: soprano child 0.8 × tone; alto, tenor, bass unchanged below the middle
    const oldVoices = (t: number) => {
      const up = Math.max(0, t - 0.5) * 2;
      return [
        { female: 1, child: 0.8 * t },
        { female: 1, child: 0.5 * up },
        { female: 0.3 * up, child: 0 },
        { female: 0.15 * up, child: 0 },
      ].map((body) => ({ body, brightness: 0.25, larynx: 0 }));
    };
    const oldRange = NOTES.map((m, i) => {
      const [lo, hi] = [0, 1].map((t) => bands(singAlone(solo([[m, 3]], oldVoices(t)[i]), T0 + 3 * BEAT).out));
      return dist(lo, hi);
    });
    const newRange = spectra.map((sp) => dist(sp[0], sp[4]));
    console.log("tone 0→1 spectral change (dB) S A T B: new", newRange.map((x) => x.toFixed(1)).join(" "), "old", oldRange.map((x) => x.toFixed(1)).join(" "), "; quarter steps", steps.map((s) => s.map((x) => x.toFixed(1)).join("/")).join(" "));
    // every quarter turn moves soprano, alto and tenor by over 1 dB (band RMS); the bass, whose
    // range is deliberately half (it stays the darkest), by over 0.5 dB
    steps.forEach((st, i) => st.forEach((d) => expect(d).toBeGreaterThan(i < 3 ? 1 : 0.5)));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(newRange)).toBeGreaterThan(1.7 * sum(oldRange));
    // the tenor gets brighter at every step (formants up)
    const tc = tones.map((t) => sustained(58, voicesFor(t)[2]).centroid);
    for (let k = 1; k < tc.length; k++) expect(tc[k]).toBeGreaterThan(tc[k - 1]);
  }, 600_000);
});
