# Pulse

Lightweight macOS menu bar app for real-time **network**, **disk**, **CPU**, and **GPU** activity.

## Features

- Menu bar: live download/upload Mbps
- Popover: network, disk, CPU, and GPU totals with top 5 active processes per section
- Sparkline histories for each metric
- No root, no SIP changes, no third-party dependencies

## Requirements

- macOS 14+
- Xcode 15+ / Swift 6

## Build & run

```bash
cd apps/pulse

# Run directly (debug)
swift run

# Build .app bundle
./build-app.sh
open dist/Pulse.app
```

## Development

```bash
swift build
swift test
```

## Architecture

```
NSStatusItem + NSPopover (SwiftUI)
├── NetworkMonitor  → netstat -ib rates, nettop -P per-process
├── DiskMonitor     → ioreg IOBlockStorageDriver stats, proc_pid_rusage
├── CPUMonitor      → host_statistics CPU load, ps top processes
└── GPUMonitor      → IOKit IOAccelerator performance statistics
```

Patterns borrowed from [Stats](https://github.com/exelban/stats), [MacStatusBar](https://github.com/ysyyork/MacStatusBar), and [Netwatch](https://github.com/corvid-agent/Netwatch).

## Docs

- [Research notes](docs/research.md)
- [CPU & GPU plan](docs/cpu-gpu-plan.md)

## Status

MVP — v0.1.0