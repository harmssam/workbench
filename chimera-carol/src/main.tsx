/**
 * Entry: load the engine (wasm) first — UI modules call into it as they load — then import and
 * render the page (the Carol of the Bells player; see src/ui/mount.tsx). A failed load can be
 * retried.
 */
import { initChimera } from "./wasm/chimera.ts";

const root = document.getElementById("root")!;

async function boot(): Promise<void> {
  try {
    await initChimera();
  } catch (err) {
    root.replaceChildren();
    const box = document.createElement("div");
    box.className = "boot-error";
    const msg = document.createElement("p");
    msg.textContent = `The voice engine could not load: ${err instanceof Error ? err.message : String(err)}`;
    const retry = document.createElement("button");
    retry.className = "play";
    retry.textContent = "Try again";
    retry.onclick = () => void boot();
    box.append(msg, retry);
    root.append(box);
    return;
  }
  const { mount } = await import("./ui/mount.tsx");
  mount(root);
}

void boot();
