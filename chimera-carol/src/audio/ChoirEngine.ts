/**
 * Main-thread side of the choir: one Worker per part, each with its own voice engine, streaming
 * into one "chimera-choir" worklet node that mixes them on a shared sample clock into the same
 * master bus as the main voice (see src/worklet/choirMix.ts for why not four worklet nodes).
 * Built on first use, after the main engine has started audio; reused by every run after.
 */
import { engine } from "./AudioEngine.ts";
import { chimeraModule } from "../wasm/chimera.ts";
import type { PartPlan } from "../worklet/choirPart.ts";
import type { ChoirTele, ToChoirVoice } from "../worklet/choirVoice.ts";
import { TeleQueue } from "./teleQueue.ts";
import type { VoiceTelemetry } from "../wasm/types.ts";
import type { ChoirReport, ToChoir } from "../worklet/protocol.ts";

/** a report from the choir, with its clock in seconds */
export type ChoirProgress = ChoirReport & { time: number };

/** seconds each part buffers before the run starts */
const PREROLL = 0.5;

export class ChoirEngine {
  private node: AudioWorkletNode | null = null;
  private workers: Worker[] = [];
  private listeners = new Set<(r: ChoirProgress) => void>();
  /** the run playing (0: none) */
  run = 0;
  private lastRun = 0;
  /** per part: its telemetry, ahead of playback */
  private teles: TeleQueue[] = [];
  /** the latest splice: its generation and frame (older readings from that frame on are stale) */
  private cut = { seq: 0, at: Infinity };
  private seq = 0;
  /** the latest report: the mixer's frame, and when it came (performance.now) */
  private heard: { run: number; frame: number; at: number; moving: boolean } | null = null;

  /** Build the node and `parts` Workers (once); the main engine must have started audio. */
  private ensure(parts: number): void {
    const ctx = engine.ctx;
    const out = engine.output;
    if (!ctx || !out) throw new Error("choir: audio not started");
    if (this.node && this.workers.length === parts) return;
    this.dispose();
    const node = new AudioWorkletNode(ctx, "chimera-choir", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.connect(out);
    this.node = node;
    node.port.onmessage = (e: MessageEvent<ChoirReport>) => {
      if (e.data.run !== this.run) return;
      this.heard = { run: e.data.run, frame: e.data.frame, at: performance.now(), moving: e.data.started && !e.data.finished };
      const r = { ...e.data, time: e.data.frame / ctx.sampleRate };
      for (const l of this.listeners) l(r);
    };
    const ports: MessagePort[] = [];
    for (let part = 0; part < parts; part++) {
      const w = new Worker(new URL("../worklet/choirVoice.ts", import.meta.url), { type: "module" });
      const q = new TeleQueue();
      this.teles.push(q);
      w.onmessage = (e: MessageEvent<ChoirTele>) => {
        const d = e.data;
        if (d.type !== "tele" || d.run !== this.run) return;
        if (d.seq >= this.cut.seq || d.frame < this.cut.at) q.push(d.frame, d.t);
      };
      const ch = new MessageChannel();
      const init: ToChoirVoice = { type: "init", module: chimeraModule(), fs: ctx.sampleRate, part, port: ch.port1 };
      w.postMessage(init, [ch.port1]);
      ports.push(ch.port2);
      this.workers.push(w);
    }
    this.send({ type: "ports", ports }, ports);
  }

  /** Sing these parts together from their shared time 0. Returns the run id. */
  play(plans: PartPlan[], gains: number[]): number {
    this.ensure(plans.length);
    const run = ++this.lastRun;
    this.run = run;
    this.heard = null;
    this.seq = 0;
    this.cut = { seq: 0, at: Infinity };
    for (const q of this.teles) q.clear();
    const fs = engine.ctx!.sampleRate;
    this.send({ type: "begin", run, gains, preroll: Math.round(PREROLL * fs) });
    plans.forEach((plan, i) => this.workers[i].postMessage({ type: "start", run, plan } satisfies ToChoirVoice));
    return run;
  }

  /**
   * Hand every part over to a new plan at frame `at` without stopping (a knob turned while
   * singing: the rest of the song at a new tempo, or new voices). Each Worker renders its old
   * engine on past `at`, then a new engine warmed up on `plan` from `plan.start`; the worklet
   * crossfades at `at`. Returns the splice's generation.
   */
  splice(plans: PartPlan[], at: number): number {
    if (!this.run) return 0;
    const seq = ++this.seq;
    this.cut = { seq, at };
    for (const q of this.teles) q.truncate(at);
    plans.forEach((plan, i) => this.workers[i]?.postMessage({ type: "splice", run: this.run, seq, plan, at } satisfies ToChoirVoice));
    return seq;
  }

  /** Silence every part now and stop their Workers rendering. */
  stop(): void {
    this.run = 0;
    this.heard = null;
    for (const q of this.teles) q.clear();
    this.send({ type: "stop" });
    for (const w of this.workers) w.postMessage({ type: "stop" } satisfies ToChoirVoice);
  }

  /** The frame being heard now (null: nothing playing), from the latest report plus the time
   *  since (at most 0.1 s: reports come about 60 times a second). */
  frameNow(): number | null {
    const h = this.heard;
    const ctx = engine.ctx;
    if (!h || !ctx || h.run !== this.run) return null;
    return h.moving ? h.frame + Math.min(0.1, (performance.now() - h.at) / 1000) * ctx.sampleRate : h.frame;
  }

  /** Part `i`'s voice at the frame being heard (null: not yet, or nothing playing). */
  teleNow(i: number): VoiceTelemetry | null {
    const f = this.frameNow();
    return f === null ? null : (this.teles[i]?.at(f) ?? null);
  }

  get sampleRate(): number {
    return engine.ctx?.sampleRate ?? 48000;
  }

  onReport(l: (r: ChoirProgress) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private send(m: ToChoir, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(m, transfer);
  }

  private dispose(): void {
    this.node?.disconnect();
    this.node = null;
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.teles = [];
  }
}

export const choir = new ChoirEngine();
