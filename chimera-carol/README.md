# Carol of the Bells — CHIMERA choir player

Interactive browser player: four live physically modelled voices sing Mykola Leontovych’s
**Shchedryk** (public-domain SATB; shown as *Carol of the Bells*). Nonlexical syllable `la`
only — no English Wilhousky lyrics.

Built as a focused player on top of [jamesondh/chimera-vocal-synth](https://github.com/jamesondh/chimera-vocal-synth)
at commit `092b16ce12b927d473c884ca2dfae53ce1b995df` (MIT License — see [LICENSE](LICENSE);
copyright Jameson Hodge). This folder vendors that revision plus the Carol SATB choir UI
(polyphony, heads, live tempo/tone knobs).

**Live demo (anonymous here.now, expires ~24h from publish):**
https://whimsy-badge-n4xy.here.now/

## Score

Leontovych SATB with written repeat expanded (~205.5 beats). Entrances S1 / A5 / T9 / B13.
Encoded in `src/ui/carol-satb.json` from public-domain sources (IMSLP / PlayableNotes MIDI).

## Build / run

Needs **Rust** (wasm32 target) and **Bun**.

```bash
cd chimera-carol
bun install
rustup target add wasm32-unknown-unknown   # once
bun run build       # wasm + Vite → dist/
bun run preview     # serve dist
# or
bun run dev         # Vite dev server
```

Tests: `bun test tests/choir.test.ts`

## Layout

Simple player: Play/Stop, Tempo, Voice tone; 2×2 passive animated heads (S A / T B).
