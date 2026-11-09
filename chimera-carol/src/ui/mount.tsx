import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CarolPlayer } from "./CarolPlayer.tsx";
import { engine } from "../audio/AudioEngine.ts";

export function mount(root: HTMLElement): void {
  // console/debug handle (used by the browser smoke test)
  (window as unknown as { __chimeraEngine: typeof engine }).__chimeraEngine = engine;
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <CarolPlayer />
    </StrictMode>,
  );
}
