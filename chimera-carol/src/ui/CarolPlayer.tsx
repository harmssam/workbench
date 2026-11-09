/**
 * The whole page: a Carol of the Bells player. Four live CHIMERA voices (src/ui/choir.ts) sing
 * Leontovych's SATB "Shchedryk"; Play / Stop, and two knobs that change the synthesis: tempo
 * (the bpm the four parts are planned at) and voice tone (each part's body, fold brightness and
 * larynx). A knob turned while playing takes effect live, from the current beat (choir.ts
 * retune): the song carries on, it does not go back to bar 1. Between
 * the button and the knobs, the four singers' heads (ChoirHeads), 2×2.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { engine } from "../audio/AudioEngine.ts";
import { useChoir, playChoir, stopChoir, setTempo, setTone, PARTS, SCORE, CHOIR_NAME, TEMPO_MIN, TEMPO_MAX, barOf, BARS } from "./choir.ts";
import "./player.css";

/** the four 3D heads load after the player (three.js is most of the page's weight) */
const ChoirHeads = lazy(() => import("./ChoirHeads.tsx"));

/** audio for the choir only: the output bus, without the solo voice */
export const startAudio = () => engine.start({ voice: false });

/** The Play / Stop button: stop all four voices, or start them from bar 1. */
export function togglePlay(): Promise<void> {
  const s = useChoir.getState();
  if (s.run !== 0 || s.starting) {
    stopChoir();
    return Promise.resolve();
  }
  return playChoir(startAudio);
}

const toneWord = (t: number) => (t < 0.25 ? "Dark" : t < 0.45 ? "Warm" : t <= 0.55 ? "Natural" : t < 0.8 ? "Light" : "Bright");

/** A labelled slider whose value commits a moment after the last move (each commit while playing
 *  hands the four voices to new engines, so a drag commits once it settles, not at every step). */
function Knob(props: { label: string; min: number; max: number; step: number; value: number; show: (v: number) => string; commit: (v: number) => void }) {
  const [draft, setDraft] = useState(props.value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(props.value), [props.value]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <label className="knob">
      <span className="knob-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={draft}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => props.commit(v), 350);
        }}
      />
      <span className="knob-value">{props.show(draft)}</span>
    </label>
  );
}

export function CarolPlayer() {
  const run = useChoir((s) => s.run);
  const starting = useChoir((s) => s.starting);
  const beat = useChoir((s) => s.beat);
  const parts = useChoir((s) => s.parts);
  const bpm = useChoir((s) => s.bpm);
  const tone = useChoir((s) => s.tone);
  const error = useChoir((s) => s.error);
  const on = run !== 0 || starting;
  const status = error
    ? `Could not start: ${error}`
    : starting
      ? "Warming up four voices…"
      : run
        ? `Bar ${barOf(beat)} of ${BARS}`
        : "Four voices synthesized live. Tempo and tone change as it sings.";
  return (
    <main className="player">
      <header>
        <h1>{CHOIR_NAME}</h1>
        <p className="sub">Shchedryk · Mykola Leontovych, SATB (public domain)</p>
      </header>
      <button type="button" className={`play${on ? " on" : ""}`} onClick={() => void togglePlay()} aria-pressed={on}>
        {on ? "Stop" : "Play"}
      </button>
      <p className={`status${error ? " error" : ""}`} role="status">
        {status}
      </p>
      <Suspense
        fallback={
          <ul className="parts" aria-label="Voices">
            {PARTS.map((p, i) => (
              <li key={p.key} className={`${parts[i].entered ? "in" : ""}${parts[i].singing ? " sing" : ""}`}>
                {p.name}
              </li>
            ))}
          </ul>
        }
      >
        <ChoirHeads />
      </Suspense>
      <div className="knobs">
        <Knob label="Tempo" min={TEMPO_MIN} max={TEMPO_MAX} step={1} value={bpm} show={(v) => `${v} bpm`} commit={(v) => void setTempo(v)} />
        <Knob label="Voice tone" min={0} max={1} step={0.05} value={tone} show={toneWord} commit={(v) => void setTone(v)} />
      </div>
    </main>
  );
}
