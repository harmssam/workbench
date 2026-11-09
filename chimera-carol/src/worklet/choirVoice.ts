/**
 * A Worker singing one choir part live: its stream (PartStream: its own engine) renders the part
 * in chunks and sends them to the "chimera-choir" worklet over a MessagePort, staying at most
 * AHEAD seconds ahead of what the worklet has played (the worklet reports how much it has played).
 *
 * From the main thread: { type: "init", module, fs, part, port }, then { type: "start", run, plan },
 * { type: "splice", run, seq, plan, at } (a knob turned while singing) and { type: "stop" }.
 * To the worklet: chunks { run, part, chunk, done } (transferred) and splice markers
 * { run, part, splice: at }. To the main thread, every TELE_EVERY samples: the engine's
 * telemetry stamped with the frame it describes and the stream's generation
 * ({ type: "tele", run, part, seq, frame, t }), so the part's head shows the airway that is
 * sounding when the mixer plays that frame.
 */
import { PartStream, type StreamOut } from "./choirStream.ts";
import type { PartPlan } from "./choirPart.ts";
import type { VoiceTelemetry } from "../wasm/types.ts";

export type ToChoirVoice =
  | { type: "init"; module: WebAssembly.Module; fs: number; part: number; port: MessagePort }
  | { type: "start"; run: number; plan: PartPlan }
  | { type: "splice"; run: number; seq: number; plan: PartPlan; at: number }
  | { type: "stop" };

export type ChoirChunk = { run: number; part: number; chunk: Float32Array; done: boolean } | { run: number; part: number; splice: number };

export interface ChoirTele {
  type: "tele";
  run: number;
  part: number;
  /** the stream's generation (a splice starts a new one) */
  seq: number;
  /** samples rendered when this was read (on the run's shared clock) */
  frame: number;
  t: VoiceTelemetry;
}

const CHUNK = 2048;
const AHEAD = 1.5;

let stream: PartStream | null = null;
let port: MessagePort | null = null;
let part = 0;
let run = 0;
/** samples of this run the worklet has played */
let played = 0;
let pumping = false;

const tele = (frame: number, t: VoiceTelemetry) => {
  const m: ChoirTele = { type: "tele", run, part, seq: stream?.seq ?? 0, frame, t };
  self.postMessage(m);
};

function send(o: StreamOut): void {
  if (!port) return;
  if (o.kind === "splice") port.postMessage({ run, part, splice: o.at } satisfies ChoirChunk);
  else port.postMessage({ run, part, chunk: o.chunk, done: o.done } satisfies ChoirChunk, [o.chunk.buffer]);
}

function pump(): void {
  pumping = false;
  const s = stream;
  if (!s || !port || !run || s.done) return;
  if (s.frame - played >= AHEAD * s.fs) return; // the worklet's next report restarts this
  send(s.next(CHUNK, tele));
  // yield, so a stop, a splice or a report gets in between chunks
  if (!s.done) schedulePump();
}

function schedulePump(): void {
  if (pumping) return;
  pumping = true;
  setTimeout(pump, 0);
}

self.onmessage = (e: MessageEvent<ToChoirVoice>) => {
  const m = e.data;
  if (m.type === "init") {
    stream = new PartStream(m.module, m.fs);
    part = m.part;
    port = m.port;
    port.onmessage = (r: MessageEvent<{ run: number; played: number }>) => {
      if (r.data.run !== run) return;
      played = r.data.played;
      schedulePump();
    };
  } else if (m.type === "start") {
    run = m.run;
    played = 0;
    stream?.begin(m.plan);
    schedulePump();
  } else if (m.type === "splice") {
    if (m.run !== run || !stream) return;
    for (const o of stream.splice(m.seq, m.plan, m.at, tele)) send(o);
    schedulePump();
  } else if (m.type === "stop") {
    run = 0;
  }
};
