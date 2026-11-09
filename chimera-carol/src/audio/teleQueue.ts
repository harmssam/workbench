/**
 * A choir part's telemetry, rendered ahead of playback (its Worker runs up to 1.5 s ahead) and
 * picked by the frame the mixer is playing: `at(frame)` is the newest reading taken at or before
 * that frame, so a head shows the airway that is sounding, not the one being rendered.
 */
import type { VoiceTelemetry } from "../wasm/types.ts";

export class TeleQueue {
  private items: { frame: number; t: VoiceTelemetry }[] = [];

  push(frame: number, t: VoiceTelemetry): void {
    this.items.push({ frame, t });
    // bounded: a Worker far ahead of a stalled mixer keeps the newest ~4 s
    if (this.items.length > 200) this.items.splice(0, this.items.length - 200);
  }

  /** The reading for `frame` (null: none yet); older readings are dropped. */
  at(frame: number): VoiceTelemetry | null {
    const it = this.items;
    let k = -1;
    while (k + 1 < it.length && it[k + 1].frame <= frame) k++;
    if (k < 0) return null;
    if (k > 0) it.splice(0, k);
    return it[0].t;
  }

  /** Drop the readings from `frame` on (a splice: a new engine sounds from there). */
  truncate(frame: number): void {
    this.items = this.items.filter((x) => x.frame < frame);
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}
