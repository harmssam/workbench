/**
 * Read a human voice's telemetry block from an engine instance (crates/chimera-wasm/src/lib.rs
 * `engine_telemetry`): the main voice's worklet and each choir part's Worker both use it.
 * Arrays are copies (the wasm memory is reused by the next call).
 */
import { fromUtf8 } from "../wasm/wire.ts";
import type { VoiceTelemetry } from "../wasm/types.ts";

type Fn = (...a: number[]) => number;
export type EngineExports = { memory: WebAssembly.Memory } & Record<string, Fn>;

/** scalars at the head of the human telemetry block */
const TELE_HEADER = 16;

export function readTelemetry(x: EngineExports, h: number): VoiceTelemetry {
  const mem = x.memory.buffer;
  const p = x.engine_telemetry(h);
  const [phLen, orLen, velumPort, f0, voicing, pLung, outRms, noiseLevel, noiseNode, gate, clock, nArtic, nPh, nOr, nScope, nActive] = new Float64Array(mem, p, TELE_HEADER);
  const all = new Float64Array(mem, p, TELE_HEADER + nArtic + 3 * (nPh + nOr) + 2 * nScope);
  let o = TELE_HEADER;
  const take = (n: number) => Float32Array.from(all.subarray(o, (o += n)));
  const artic = take(nArtic), phAreas = take(nPh), orAreas = take(nOr), pressureRms = take(nPh + nOr), flow = take(nPh + nOr), glottalArea = take(nScope), glottalFlow = take(nScope);
  const labels = new Uint8Array(mem, x.engine_tele_labels(h), 4 * 25);
  const active: string[] = [];
  for (let i = 0; i < nActive; i++) active.push(fromUtf8(labels.subarray(i * 25 + 1, i * 25 + 1 + labels[i * 25])));
  return { artic, phAreas, orAreas, phLen, orLen, pressureRms, flow, velumPort, glottalArea, glottalFlow, f0, voicing, pLung, outRms, noiseLevel, noiseNode, gate, clock, active };
}
