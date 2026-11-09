/**
 * One choir part's voice: its own engine instance (as the AudioWorklet runs the main voice),
 * given the part's whole gesture plan at clock 0, rendered block by block. The choir's Workers
 * run this; the tests run it directly.
 */
import { writeGestures, CONTROL_KEYS } from "../wasm/wire.ts";
import { readTelemetry, type EngineExports as Exports } from "./teleRead.ts";
import type { BodyMix, Gesture, VoiceTelemetry } from "../wasm/types.ts";

/** what a part's engine needs to sing it (planned on the main thread) */
export interface PartPlan {
  body: BodyMix;
  /** source brightness (0 soft closure, dark … 1 abrupt, bright; the engine's default 0.25) */
  brightness?: number;
  /** resting posture for articulators the sung gestures leave alone (e.g. epilarynx: the
   *  singer's ring), by name (CONTROL_KEYS) */
  posture?: Record<string, number>;
  /** pitch of the first sung note (Hz): the folds start there */
  f0: number;
  /** run time (s) of the engine's clock 0: 0 for a run's first engine, later for a splice's */
  start: number;
  /** times on the engine's clock (run time − start) */
  gestures: Gesture[];
  /** last sound (s, engine clock) */
  end: number;
}

/** gestures per schedule call (MAX_SCHEDULE in crates/chimera/src/engine.rs) */
const BATCH = 4000;
const SOURCE_KEYS = ["f0", "glide", "pressure", "breathiness", "tension", "fry", "roughness", "vibratoDepth", "vibratoRate", "drift", "voiced", "brightness"];

export class PartVoice {
  private readonly x: Exports;
  private h = 0;
  /** samples rendered since `begin` */
  rendered = 0;
  /** samples the part lasts (its plan's end plus a tail) */
  total = 0;

  constructor(module: WebAssembly.Module, readonly fs: number) {
    this.x = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
  }

  /** A fresh engine singing `plan` from its time 0 (the previous run's engine is dropped). */
  begin(plan: PartPlan): void {
    const x = this.x;
    if (this.h) x.engine_free(this.h);
    this.h = x.engine_new(this.fs);
    x.engine_set_body(this.h, plan.body.female, plan.body.child);
    const v = new Float64Array(x.memory.buffer, x.engine_values(this.h), 32).fill(NaN);
    v[SOURCE_KEYS.indexOf("f0")] = plan.f0;
    v[SOURCE_KEYS.indexOf("voiced")] = 1;
    if (plan.brightness !== undefined) v[SOURCE_KEYS.indexOf("brightness")] = plan.brightness;
    x.engine_set_source(this.h);
    if (plan.posture) {
      const p = new Float64Array(x.memory.buffer, x.engine_values(this.h), 32).fill(NaN);
      for (const [k, val] of Object.entries(plan.posture)) {
        const i = (CONTROL_KEYS as readonly string[]).indexOf(k);
        if (i >= 0 && i < 17) p[i] = val;
      }
      x.engine_set_artic(this.h, 2);
    }
    for (let i = 0; i < plan.gestures.length; i += BATCH) {
      const n = writeGestures(x.memory.buffer, x.engine_records(this.h), plan.gestures.slice(i, i + BATCH), BATCH);
      // the new engine's clock is 0, so plan times are run times
      x.engine_schedule(this.h, n, 0, 0);
    }
    this.rendered = 0;
    this.total = Math.round((plan.end + 0.5) * this.fs);
  }

  get done(): boolean {
    return this.rendered >= this.total;
  }

  /** The voice's state now (after the samples rendered so far): articulators, airway, flow. */
  telemetry(): VoiceTelemetry {
    return readTelemetry(this.x, this.h);
  }

  /** The next `n` samples (fewer at the part's end). */
  render(n: number): Float32Array {
    const x = this.x;
    const out = new Float32Array(Math.max(0, Math.min(n, this.total - this.rendered)));
    for (let i = 0; i < out.length; i += 128) {
      const m = Math.min(128, out.length - i);
      out.set(new Float32Array(x.memory.buffer, x.engine_render(this.h, m), m), i);
    }
    this.rendered += out.length;
    return out;
  }
}
