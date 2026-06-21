# sysmon

Lightweight macOS menu bar app for real-time **network** and **disk** activity.

## Goals

- Glanceable ↑↓ network speeds and read/write disk rates in the menu bar
- Optional popover: per-interface breakdown, top processes, simple sparklines
- No root, no SIP changes, no App Store sandbox (Developer ID distribution)
- Small codebase — borrow proven patterns from open source, write only what is missing

## Non-goals (v1)

- Per-file disk tracing (`fs_usage` / DTrace)
- Packet capture / deep traffic analysis
- Full system monitor (CPU, GPU, sensors, etc.)

## Architecture (planned)

```
MenuBarExtra (SwiftUI)
├── NetworkService (poll ~1s)
│   ├── getifaddrs() deltas → interface RX/TX rates
│   └── nettop -P -L 1 (optional) → per-process network bytes
└── DiskIOService (poll ~1s)
    ├── IOKit IOBlockStorageDriver statistics → per-disk read/write speeds
    └── proc_pid_rusage() → top processes by disk I/O
```

## Reference implementations

| Concern | Borrow from |
|---------|-------------|
| Network rates | [Stats](https://github.com/exelban/stats) Net module, [macnetmon](https://github.com/mdsakalu/macnetmon) |
| Per-app network | [Netwatch](https://github.com/corvid-agent/Netwatch) (`nettop` parsing) |
| Disk I/O | [MacStatusBar](https://github.com/ysyyork/MacStatusBar) `DiskMonitor`, [Stats](https://github.com/exelban/stats) Disk module |
| Minimal shell | [macos-bandwidth-monitor](https://github.com/dhanushreddy291/macos-bandwidth-monitor) |

## Build stack

- Swift 5.9+, SwiftUI, `MenuBarExtra`
- Xcode project (no SPM third-party deps for v1)
- macOS 14+ target

## Docs

- [Research notes](docs/research.md) — open-source landscape and API tradeoffs

## Status

Planning — no implementation yet.