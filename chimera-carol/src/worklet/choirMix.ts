/**
 * The choir's mixer, run inside the "chimera-choir" AudioWorklet processor (pure, so bun can test
 * it). Each part's voice engine renders in its own Worker (one engine costs about a third of a
 * core in wasm, so four don't fit on the one audio thread) and streams its samples here. All
 * parts share one sample clock: frame 0 is the plan's time 0 for every part, and the mixer only
 * advances when every unfinished part has the samples for the block, so a part that falls behind
 * pauses the whole choir instead of drifting out of sync.
 *
 * A splice (a knob turned while singing; see choirStream.ts) arrives in a part's stream as a
 * marker: the samples after it are the part's new engine from frame `at`. The mixer crossfades
 * from the old stream to the new one over XFADE samples from `at` (equal-gain, raised cosine), so
 * the change is click-free and nothing is rewound.
 */
import { xfade } from "./choirStream.ts";

class Stream {
  queue: Float32Array[] = [];
  head = 0;
  buffered = 0;
  done = false;
  /** samples still to drop from the front (a splice that came after its frame was played) */
  skip = 0;

  push(chunk: Float32Array): void {
    let c = chunk;
    if (this.skip > 0) {
      const k = Math.min(this.skip, c.length);
      this.skip -= k;
      c = c.subarray(k);
    }
    if (!c.length) return;
    this.queue.push(c);
    this.buffered += c.length;
  }

  /** the next sample (0 when there is none) */
  pop(): number {
    const c = this.queue[0];
    if (!c) return 0;
    const v = c[this.head++];
    this.buffered--;
    if (this.head >= c.length) {
      this.queue.shift();
      this.head = 0;
    }
    return v;
  }
}

export class MixPart {
  cur = new Stream();
  /** the stream after a splice, from frame `from` (null: none pending) */
  next: Stream | null = null;
  from = 0;
  /** where the crossfade ends: `from` + XFADE */
  until = 0;
  /** RMS of this part's latest mixed block (before gain) */
  level = 0;
  constructor(public gain: number) {}

  /** samples buffered in the current stream */
  get buffered(): number {
    return this.cur.buffered;
  }
  /** the part has sent its last sample */
  get done(): boolean {
    return !this.next && this.cur.done;
  }
}

type Early = { run: number; i: number; chunk: Float32Array; done: boolean } | { run: number; i: number; splice: number };

export class ChoirMixer {
  /** the run being played (0: none); samples from any other run are dropped */
  run = 0;
  parts: MixPart[] = [];
  /** samples mixed since the run's time 0 */
  frame = 0;
  started = false;
  /** samples each part must have buffered before the run starts */
  preroll = 0;
  /** crossfade length (samples) */
  private xf: number;
  /** the newest run begun or stopped: anything older is stale */
  private newest = 0;
  /** messages of a newer run that came in before its `begin` (Workers and the main thread use
   *  different ports, so their messages can cross) */
  private early: Early[] = [];

  constructor(fs = 48000) {
    this.xf = xfade(fs);
  }

  /** Start run `run` (runs only increase) with one gain per part. */
  begin(run: number, gains: number[], preroll: number): void {
    this.run = run;
    this.newest = Math.max(this.newest, run);
    this.parts = gains.map((gain) => new MixPart(gain));
    this.frame = 0;
    this.started = false;
    this.preroll = preroll;
    const early = this.early.filter((c) => c.run === run);
    this.early = this.early.filter((c) => c.run > run);
    for (const c of early) {
      if ("splice" in c) this.splice(c.run, c.i, c.splice);
      else this.push(c.run, c.i, c.chunk, c.done);
    }
  }

  private stash(e: Early): boolean {
    if (e.run <= this.newest) return false;
    // a run's begin follows its first chunks closely; a cap guards against one that never comes
    if (this.early.length < 256) this.early.push(e);
    return true;
  }

  /** Samples from part `i` of `run` (a chunk may be empty; `done` marks the end of the part's
   *  current stream: the one after its latest splice). */
  push(run: number, i: number, chunk: Float32Array, done = false): void {
    if (this.stash({ run, i, chunk, done })) return;
    const p = this.parts[i];
    if (run !== this.run || !p) return;
    const s = p.next ?? p.cur;
    s.push(chunk);
    if (done) s.done = true;
  }

  /** Part `i`'s samples from here on are a new engine's, from frame `at` (crossfaded in). */
  splice(run: number, i: number, at: number): void {
    if (this.stash({ run, i, splice: at })) return;
    const p = this.parts[i];
    if (run !== this.run || !p) return;
    // a splice still pending: the newer one replaces it (its samples haven't started)
    const next = new Stream();
    p.from = Math.max(at, this.frame);
    // its frame already played (a late message): drop what it has for those frames
    next.skip = p.from - at;
    p.until = p.from + this.xf;
    // the old stream is complete now: what it lacks is silence, not lateness
    p.cur.done = true;
    p.next = next;
  }

  /** Drop everything: the output is silent until the next `begin`. */
  stop(): void {
    this.newest = Math.max(this.newest, this.run);
    // a replay's chunks may already be here, ahead of its begin
    this.early = this.early.filter((c) => c.run > this.newest);
    this.run = 0;
    this.parts = [];
    this.frame = 0;
    this.started = false;
  }

  /** every part has played all it was sent, after its last sample */
  get finished(): boolean {
    return this.run !== 0 && this.parts.length > 0 && this.parts.every((p) => p.done && p.cur.buffered === 0);
  }

  /** Can part `p` give the block [F, F + n)? (the new stream's frames must be here) */
  private ready(p: MixPart, F: number, n: number): boolean {
    if (p.next) {
      const need = Math.max(0, F + n - Math.max(p.from, F));
      return p.next.done || p.next.buffered >= need;
    }
    return p.cur.done || p.cur.buffered >= n;
  }

  /** Mix the next `out.length` samples into `out` (overwritten). Returns whether the clock moved. */
  render(out: Float32Array): boolean {
    out.fill(0);
    const n = out.length;
    if (!this.run || !this.parts.length) return false;
    if (!this.started) {
      if (!this.parts.every((p) => p.cur.done || p.cur.buffered >= this.preroll)) return false;
      this.started = true;
    }
    const F = this.frame;
    // all or nothing: a part short of samples (not finished) holds everyone back
    if (!this.parts.every((p) => this.ready(p, F, n))) return false;
    if (this.finished) return false;
    for (const p of this.parts) {
      let e = 0;
      for (let j = 0; j < n; j++) {
        const f = F + j;
        let v: number;
        if (p.next && f >= p.from) {
          const nv = p.next.pop();
          if (f < p.until) {
            // raised-cosine crossfade, old out and new in
            const w = 0.5 - 0.5 * Math.cos((Math.PI * (f - p.from)) / (p.until - p.from));
            v = (1 - w) * p.cur.pop() + w * nv;
          } else v = nv;
        } else v = p.cur.pop();
        out[j] += p.gain * v;
        e += v * v;
      }
      p.level = Math.sqrt(e / n);
      if (p.next && F + n >= p.until) {
        // the crossfade is over: the new stream is the part's stream
        p.cur = p.next;
        p.next = null;
      }
    }
    this.frame += n;
    return true;
  }
}
