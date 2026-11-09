/**
 * The choir's four heads, 2×2 (soprano, alto / tenor, bass), the upstream 3D head
 * (AnatomyView3D with a HeadFeed, as the duet page drives it), passive: nothing to drag.
 *
 * Each head moves from its own part's engine: the Worker reads the voice's telemetry
 * (articulators, airway areas, pressures, flow, folds) every 1024 samples, stamped with the
 * sample frame, and the head shows the reading at the frame the mixer is playing now. The word at
 * each mouth ("la") comes from the planned notes on the same shared clock (see choir.ts sungNow).
 * Stopped: the heads hold their last shape at rest.
 */
import { useMemo, useRef } from "react";
import { AnatomyView3D, type HeadFeed } from "./components/AnatomyView3D.tsx";
import { choir } from "../audio/ChoirEngine.ts";
import { getModel } from "./useModel.ts";
import { VoiceModel } from "./analysis.ts";
import { NEUTRAL } from "../wasm/engine.ts";
import { risingWords } from "./mouthWords.ts";
import { V } from "./colors.ts";
import { useChoir, bodiesFor, sungNow, PARTS, BEATS_PER_BAR } from "./choir.ts";
import type { ViewFlags } from "./render/anatomy.ts";
import type { OverlayFn } from "./components/AnatomyView.tsx";
import type { HumanArtic } from "../wasm/types.ts";
import "./heads.css";

/** the duet page's heads: airflow and pressure, no grid or measurements */
const VIEW: ViewFlags = { pressure: true, particles: true, grid: false, calipers: false };

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** the left column faces right, the right column left: the four sing to each other */
const facingOf = (i: number): 1 | -1 => (i % 2 === 0 ? 1 : -1);

function Head(props: { i: number }) {
  const { i } = props;
  const part = PARTS[i];
  const tone = useChoir((s) => s.tone);
  // re-render on a new run: audio may have started (the model follows the context's rate)
  useChoir((s) => s.run);
  const entered = useChoir((s) => s.parts[i].entered);
  const singing = useChoir((s) => s.parts[i].singing);
  const running = useChoir((s) => s.run !== 0);
  const body = bodiesFor(tone)[i];
  const fs = choir.sampleRate;
  const facing = facingOf(i);
  const feed = useMemo<HeadFeed>(() => {
    const model = getModel(body, fs);
    let artic: HumanArtic = { ...NEUTRAL };
    return {
      model,
      view: VIEW,
      maxDpr: typeof window !== "undefined" && window.innerWidth < 700 ? 1 : 1.5,
      facing,
      frame: () => {
        const epoch = useChoir.getState().run;
        const t = choir.teleNow(i);
        // no reading for the frame heard (stopped, or not started): hold the last shape at rest
        if (!t || t.phAreas.length !== model.nPh || t.orAreas.length !== model.nOr) return { tele: null, artic, epoch };
        artic = VoiceModel.articFromArray(t.artic);
        return { tele: { type: "telemetry", t, load: 0, body, nPh: t.phAreas.length, nOr: t.orAreas.length, beatStep: -1 }, artic, epoch };
      },
    };
    // body follows tone
  }, [tone, fs, i]);
  const overlay = useRef<OverlayFn | null>(null);
  if (!overlay.current) overlay.current = risingWords(() => sungNow(i), V.green, facing, reducedMotion());
  const status = !running ? "" : !entered ? `enters bar ${part.entranceBeat / BEATS_PER_BAR + 1}` : singing ? "singing" : "resting";
  return (
    <figure className={`head${singing ? " sing" : ""}`}>
      <div className="head-view">
        <AnatomyView3D feed={feed} readouts={false} overlay={overlay.current} passive />
      </div>
      <figcaption>
        <span>{part.name}</span>
        <span className="head-status">{status}</span>
      </figcaption>
    </figure>
  );
}

export default function ChoirHeads() {
  return (
    <section className="heads" aria-label="The four singers">
      {PARTS.map((p, i) => (
        <Head key={p.key} i={i} />
      ))}
    </section>
  );
}
