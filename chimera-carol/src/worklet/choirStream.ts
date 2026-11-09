/**
 * One choir part's stream on the run's shared sample clock (absolute frames from the run's time
 * 0): what its Worker renders and sends. The tests drive it directly.
 *
 * A splice (a tempo or tone change while singing) hands the part to a new engine at frame `at`,
 * without rewinding: the old engine first renders on to `at + XFADE` (the mixer crossfades over
 * that span), then the new engine (new body, or the rest of the song replanned at the new
 * tempo) starts WARM seconds before `at` on its plan and renders that warm-up muted, so at `at`
 * it is already mid-note with its folds and airflow settled, and its output from `at` is sent.
 */
import { PartVoice, type PartPlan } from "./choirPart.ts";
import type { VoiceTelemetry } from "../wasm/types.ts";

/** crossfade from the old engine to the new one (samples at 48 kHz: 40 ms; see `xfade`) */
export const XFADE_S = 0.04;
/** a splice's new engine starts this long before its frame, muted */
export const WARM_S = 0.35;
/** telemetry about 47 times a second at 48 kHz */
export const TELE_EVERY = 1024;

export const xfade = (fs: number) => Math.round(XFADE_S * fs);

/** What a part sends the mixer: samples from `frame`, or the start of a splice. */
export type StreamOut =
  | { kind: "chunk"; seq: number; frame: number; chunk: Float32Array; done: boolean }
  | { kind: "splice"; seq: number; at: number };

export class PartStream {
  readonly voice: PartVoice;
  /** absolute frame of the engine's sample 0 */
  private base = 0;
  /** the stream's generation: 0 from begin, then one per splice */
  seq = 0;

  constructor(module: WebAssembly.Module, readonly fs: number) {
    this.voice = new PartVoice(module, fs);
  }

  /** the next frame to render (absolute) */
  get frame(): number {
    return this.base + this.voice.rendered;
  }

  get done(): boolean {
    return this.voice.done;
  }

  begin(plan: PartPlan): void {
    this.voice.begin(plan);
    this.base = Math.round(plan.start * this.fs);
    this.seq = 0;
  }

  /** Render the next up to `n` samples, with a telemetry reading every TELE_EVERY. */
  next(n: number, tele?: (frame: number, t: VoiceTelemetry) => void): StreamOut {
    const frame = this.frame;
    const chunk = new Float32Array(Math.max(0, Math.min(n, this.voice.total - this.voice.rendered)));
    for (let o = 0; o < chunk.length; o += TELE_EVERY) {
      chunk.set(this.voice.render(Math.min(TELE_EVERY, chunk.length - o)), o);
      tele?.(this.frame, this.voice.telemetry());
    }
    return { kind: "chunk", seq: this.seq, frame, chunk, done: this.voice.done };
  }

  /**
   * Hand over to `plan` (its `start` at or before `at`) at frame `at`. Returns what to send, in
   * order: the old engine's samples up to at + XFADE (those not yet rendered), then the splice.
   */
  splice(seq: number, plan: PartPlan, at: number, tele?: (frame: number, t: VoiceTelemetry) => void): StreamOut[] {
    const out: StreamOut[] = [];
    const until = at + xfade(this.fs);
    while (this.frame < until && !this.voice.done) out.push(this.next(until - this.frame, tele));
    out.push({ kind: "splice", seq, at });
    this.voice.begin(plan);
    this.base = Math.round(plan.start * this.fs);
    this.seq = seq;
    // the warm-up: rendered, not sent
    let warm = at - this.base;
    while (warm > 0 && !this.voice.done) warm -= this.voice.render(Math.min(4096, warm)).length;
    return out;
  }
}
