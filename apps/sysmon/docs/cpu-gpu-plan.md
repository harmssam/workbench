# sysmon — CPU & GPU plan

Compiled June 2026. Extends the existing network + disk popover with compute metrics, borrowing from open source where possible.

## Goals

- Add **CPU** and **GPU** cards to the popover (same `MetricCard` pattern as Network/Disk)
- Keep **menu bar** network-only for now (optional: tiny CPU % later)
- **No root**, no `powermetrics`, no App Store sandbox — Developer ID distribution
- **1s polling** for totals; defer heavy work when popover is closed (phase 2)

## Non-goals (v1)

- Per-process GPU attribution (needs sudo / `powermetrics`)
- CPU/GPU temperature as headline metrics (fragile private APIs)
- IOReport power/frequency depth (phase 2 on Apple Silicon)
- Per-core CPU bars (phase 2)

---

## Architecture

```
AppState.refresh() @ 1s
├── NetworkMonitor   (existing)
├── DiskMonitor      (existing)
├── CPUMonitor       (new) → total %, user/system, top processes
└── GPUMonitor       (new) → utilization %, memory, chip name

PopoverView
├── Network card
├── Disk card
├── CPU card         (new)
└── GPU card         (new)
```

---

## CPU

### Open-source references

| Project | Repo | Borrow |
|---------|------|--------|
| **Stats** | https://github.com/exelban/stats | `Modules/CPU/readers.swift` — `host_statistics` + `host_processor_info`, `ps` top-N |
| **SystemKit** | https://github.com/beltex/SystemKit | Minimal `usageCPU()` (~80 LOC) for v1 total % |
| **MenuMeters** | https://github.com/yujitach/MenuMeters | Delta tick math reference |

### APIs (no root)

| API | Use |
|-----|-----|
| `host_statistics(HOST_CPU_LOAD_INFO)` | System-wide user/system/idle → total % |
| `host_processor_info(PROCESSOR_CPU_LOAD_INFO)` | Per-core bars (phase 2) |
| `sysctl` (`hw.ncpu`, `hw.physicalcpu`) | Core count, chip name |
| `ps -Aceo pid,pcpu,comm -r` | Top 5 processes by CPU |

**Formula:** `usage = Δ(user+system+nice) / Δ(user+system+nice+idle)` — skip first sample.

### Popover UI (v1)

| Tile | Value |
|------|-------|
| CPU | `42%` (user+system) |
| User / System | `28%` / `14%` split |

| Table | Columns |
|-------|---------|
| Top processes | Process · CPU % |

### Implementation sketch

```
Services/CPUMonitor.swift     # actor, sampleTotal(), sampleProcesses()
Models/CPUSnapshot.swift      # totalUsage, user, system, processes[]
```

~150–200 LOC for Mach reader + ps parsing (ported from Stats, not full Kit module).

### Pitfalls

- First sample always invalid — show `—` or `0%` until second tick
- `ps %CPU` ≠ Activity Monitor exactly — fine for ranking
- Must `vm_deallocate` after `host_processor_info`
- Poll top processes every **3–5s** or only when popover open (lighter)

---

## GPU

### Open-source references

| Project | Repo | Borrow |
|---------|------|--------|
| **Stats** | https://github.com/exelban/stats | `Modules/GPU/reader.swift` — `IOAccelerator` + `PerformanceStatistics` |
| **MacStatusBar** | https://github.com/ysyyork/MacStatusBar | Popover UX patterns (not `ioreg` shell parsing) |
| **macmon** | https://github.com/vladkens/macmon | IOReport channel maps for Apple Silicon power (phase 2) |
| **NeoAsitop** | https://github.com/op06072/NeoAsitop | Swift IOReport reference |

### APIs (no root)

| API | Metrics |
|-----|---------|
| **IOKit `IOAccelerator`** → `PerformanceStatistics` | `Device Utilization %`, `Renderer Utilization %`, `Tiler Utilization %`, `In use system memory`, `VRAM,*` (discrete) |
| **IOReport** (phase 2, Apple Silicon) | GPU power (W), active residency, frequency |
| **Metal counters** | ❌ Own-app only — not for system monitor |
| **powermetrics** | ❌ Requires sudo — opt-in later only |

### Platform split

| | Apple Silicon | Intel |
|--|---------------|-------|
| GPU type | Integrated AGX | iGPU and/or AMD/NVIDIA |
| Memory label | **"GPU memory (shared)"** | **"VRAM"** when discrete |
| Extra metrics | Renderer + Tiler % | Usually device % only |

### Popover UI (v1)

| Tile | Value |
|------|-------|
| GPU | `18%` device utilization |
| Memory | `1.2 GB shared` or `VRAM 4.1/8 GB` |

Optional second row (Apple Silicon): Renderer `12%` · Tiler `6%`

### Implementation sketch

```
Services/GPUMonitor.swift     # actor, sample() → GPUSnapshot
Models/GPUSnapshot.swift      # utilization, memoryBytes, name, isAvailable
```

Port Stats' IOKit `IOAccelerator` reader directly (~100–150 LOC). Avoid MacStatusBar's `ioreg` subprocess.

### Fallback chain

```
1. IOAccelerator PerformanceStatistics (util + memory + name)
2. If unavailable or stuck at 0 on Apple Silicon → IOReport power/residency (phase 2)
3. If all fail → show "GPU metrics unavailable" (Intel without discrete, VMs, etc.)
```

### Pitfalls

- `Device Utilization %` often reads **0 when idle** — expected, not a bug
- Private IOKit keys — fine outside App Store (same as Stats)
- Don't show fake "VRAM total" on unified memory Macs
- IOReport channel names change per chip (M4/M5) — maintenance burden, defer to phase 2

---

## PR plan (suggested order)

### PR 1 — CPU monitor + popover card
- [x] `CPUMonitor` actor with `host_statistics` total %
- [x] Top 5 processes via `ps`
- [x] CPU `MetricCard` in popover
- [x] Unit tests for tick delta math
- [x] ~3 files, ~200 LOC

### PR 2 — GPU monitor + popover card
- [ ] `GPUMonitor` actor with IOKit `IOAccelerator`
- [ ] Platform-aware memory label (shared vs VRAM)
- [ ] GPU `MetricCard` in popover
- [ ] Graceful unavailable state
- [ ] ~3 files, ~200 LOC

### PR 3 — Polish (optional)
- [ ] Widen popover / scroll if 4 cards tight
- [ ] Sparklines for CPU/GPU history (60 samples)
- [ ] Menu bar: optional `CPU 12%` toggle
- [ ] Per-core CPU bars (Apple Silicon E/P grouping)
- [ ] IOReport GPU power on Apple Silicon

---

## Estimated effort

| Phase | Scope | Time |
|-------|-------|------|
| PR 1 CPU | Total % + top processes | 2–3 days |
| PR 2 GPU | IOAccelerator basics | 2–3 days |
| PR 3 Polish | Sparklines, menu bar CPU, IOReport | 3–5 days |

**Total MVP (PR 1 + 2):** ~1 week

---

## Key files to read before implementing

```
Stats/Modules/CPU/readers.swift    # LoadReader, ProcessReader
Stats/Modules/GPU/reader.swift     # IOAccelerator reader
SystemKit/System.swift           # usageCPU() minimal alternative
```

## Comparison: install for reference

```bash
brew install stats    # full system monitor reference
```