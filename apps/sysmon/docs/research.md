# sysmon — research notes

Compiled June 2026 from open-source landscape review for a simple macOS network + disk monitor.

## Summary

| Capability | Mature OSS? | Best primitive | Custom work needed |
|------------|-------------|----------------|-------------------|
| Interface bandwidth | Yes | `getifaddrs()` byte deltas | Thin menu bar UI |
| Per-app network | Partial | `nettop -P` | Parsing + popover UI |
| Per-disk I/O speed | Yes | IOKit `IOBlockStorageDriver` statistics | Thin menu bar UI |
| Per-process disk I/O | Yes | `proc_pid_rusage()` | Polling + top-N list |
| Per-file disk I/O | CLI only | `fs_usage` (root) | Out of scope for v1 |

**Recommendation:** Build a thin Swift `MenuBarExtra` app. Do not reimplement monitoring plumbing — copy patterns from Stats, MacStatusBar, and Netwatch.

---

## Network

### Top options

1. **[Stats](https://github.com/exelban/stats)** (MIT, Swift) — ~40k stars. Production menu bar app. Uses `getifaddrs()` and optional `nettop -P` for process-aggregated bandwidth. Best reference implementation.
2. **[macnetmon](https://github.com/mdsakalu/macnetmon)** (MIT, Rust) — Focused TUI for per-interface RX/TX. Good CLI backend pattern; wrap or port `getifaddrs` logic.
3. **[Netwatch](https://github.com/corvid-agent/Netwatch)** (MIT, Swift) — Small prototype with exactly our shape: `MenuBarExtra`, `nettop` per-process, `lsof` connections. Best fork starting point for per-app network.
4. **[Sniffnet](https://github.com/GyulyVGC/sniffnet)** (Apache-2.0/MIT, Rust) — Full packet sniffer. Overkill for simple bandwidth.
5. **[Netiquette](https://github.com/objective-see/Netiquette)** (GPL-3.0, Obj-C) — Connections only, no bandwidth.

### macOS constraints

- No public per-app bandwidth API (unlike Android).
- Apple **Network** framework covers your app's sockets only, not system-wide.
- App Store sandbox blocks `nettop`, `lsof`, and BPF for other processes.
- Distribution: Developer ID, not Mac App Store.

### APIs & tools

| Source | Privilege | Use |
|--------|-----------|-----|
| `getifaddrs()` | None | Interface RX/TX totals → delta = rate |
| `nettop -P -L 1` | None* | Per-process network counters |
| `lsof -i -P -n` | None* | Active connections |
| libpcap / BPF | Elevated | Packet-level (v2+ only) |

\*Works outside sandbox; blocked in App Store builds.

---

## Disk

### Top options

1. **[Stats](https://github.com/exelban/stats)** (MIT, Swift) — Disk module: IOKit statistics + `proc_pid_rusage` per-process. Most polished.
2. **[MacStatusBar](https://github.com/ysyyork/MacStatusBar)** (MIT, Swift) — Smaller codebase (~400-line `DiskMonitor.swift`). Best fork/reference for disk-only.
3. **[mac_iotop](https://github.com/Slach/mac_iotop)** (Rust) — `fs_usage` wrapper for per-file I/O. Requires `sudo`; CLI only.
4. **[disk-lights](https://github.com/tk512/disk-lights)** (Swift/C, stale 2017) — Disk activity "lights" UI concept; good IOKit reference.
5. **[iosnoopng](https://github.com/charlie0129/iosnoopng)** (MIT, Go) — DTrace-based; requires SIP off. Debug only.

### APIs & tools

| Source | Privilege | Use |
|--------|-----------|-----|
| IOKit `IOBlockStorageDriver` → `Statistics` → `Bytes (Read/Write)` | None | Per-disk cumulative bytes → delta = speed |
| `proc_pid_rusage()` → `ri_diskio_bytesread/written` | None | Per-process disk I/O |
| `iostat -d` | None | Alternative per-disk throughput |
| `fs_usage` | Root | Per-file syscall tracing (v2+ / debug mode) |

### Tradeoffs

| Approach | Granularity | Privilege | Short-lived processes |
|----------|-------------|-----------|----------------------|
| IOKit statistics | Per-disk | None | N/A (aggregate) |
| `proc_pid_rusage` | Per-process | None | Poor (must poll while alive) |
| `fs_usage` | Per-file + PID | Root | Good |

Activity Monitor's Disk tab uses `proc_pid_rusage` — same limitation.

---

## Proposed v1 feature set

**Menu bar (always visible)**

- Combined or toggled: network ↑↓ KB/s, disk read/write KB/s
- Color/icon activity indicator when above threshold

**Popover**

- Network: total + per-interface speeds; top 5 processes (if `nettop` enabled)
- Disk: per-volume read/write; top 5 processes by disk I/O
- Refresh interval: 1s

**Settings**

- Choose primary interface / disk
- Toggle per-process panels
- Launch at login

## Estimated effort

1–2 weeks for MVP if starting from Netwatch + MacStatusBar patterns rather than scratch.

## Install references (for comparison while building)

```bash
brew install stats          # full system monitor
brew install slach/tap/mac_iotop   # per-file disk (sudo)
```