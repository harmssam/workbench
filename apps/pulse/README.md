# Pulse

A lightweight macOS menu bar monitor for network, disk, CPU, and GPU activity.

**Current release: v0.1.2**

## Features

- Compact Mbps readout in the menu bar
- Popover dashboard with per-metric sparklines
- Top active processes for network, disk, CPU, and GPU
- Install-location check with guidance when not run from `/Applications`
- No root privileges, no third-party runtime dependencies

## Requirements

- macOS 14+
- Apple Silicon (arm64)
- Swift 6 / Xcode 15+ (build from source only)

## Install

Download the latest zip from [GitHub Releases](https://github.com/harmssam/workbench/releases), or build locally:

```bash
cd apps/pulse
chmod +x build-app.sh scripts/generate-app-icon.sh
./build-app.sh
cp -r dist/Pulse.app /Applications/
open /Applications/Pulse.app
```

Pulse must live in `/Applications` (or `~/Applications`) for Login Items and stable daily use. If you launch it from a build folder, Pulse will prompt you to copy it first.

On first launch, macOS may block the unsigned build. Right-click the app and choose **Open**.

### Login at startup

1. Install Pulse to `/Applications`
2. Open it once manually
3. Go to **System Settings → General → Login Items**
4. Add Pulse under **Open at Login** (it may also appear under **Allow in the Background**)

## Development

```bash
swift build
swift test
swift run          # debug — no Applications install prompt
```

## App icon

Artwork lives in `logo/`:

- `logo.svg` — preferred when `rsvg-convert` is available
- `logo.png` — fallback (1024×1024 recommended)

`build-app.sh` generates `AppIcon.icns` and bundles it into the app. For best SVG output:

```bash
brew install librsvg
```

## Releases

Build artifacts are not committed to git. Published binaries are attached to [GitHub Releases](https://github.com/harmssam/workbench/releases).

### Build locally

```bash
chmod +x build-app.sh scripts/generate-app-icon.sh
./build-app.sh
swift test
```

### Publish via CI

```bash
chmod +x scripts/release.sh
./scripts/release.sh 0.1.2
```

This creates and pushes a `pulse-v0.1.2` tag. GitHub Actions builds the app, packages a zip, and publishes the release.

## Architecture

```
NSStatusItem + NSPopover (SwiftUI)
├── NetworkMonitor  → netstat -ib, nettop -P
├── DiskMonitor     → ioreg, proc_pid_rusage
├── CPUMonitor      → host_statistics, ps
└── GPUMonitor      → IOKit IOAccelerator
```

## Further reading

- [Research notes](docs/research.md)
- [CPU & GPU plan](docs/cpu-gpu-plan.md)

## License

MIT — see [LICENSE](../../LICENSE).