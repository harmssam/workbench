# workbench

A collection of macOS applications and utility scripts.

Projects live under `apps/` (standalone applications with their own UI and distribution) or `scripts/` (focused command-line utilities and one-off tools).

## Structure

```
apps/       # Menu bar apps, CLIs, and other distributable applications
scripts/    # Utility scripts and small automation tools
docs/       # Cross-cutting notes (optional)
```

## Applications

| App | Description | Version | Releases |
|-----|-------------|---------|----------|
| [Pulse](apps/pulse/) | Real-time network, disk, CPU, and GPU monitor for the menu bar | 0.1.2 | [Download](https://github.com/harmssam/workbench/releases) |
| [Harmless Budget](apps/harmless-budget/) | Local-only desktop budgeting app — your data stays on your Mac | 0.1.0 | [Download](https://github.com/harmssam/workbench/releases) |

### Pulse

Install from [GitHub Releases](https://github.com/harmssam/workbench/releases) or build from source — see [apps/pulse/README.md](apps/pulse/README.md).

```bash
# Install a release build
# 1. Download Pulse-v0.1.2-macos-arm64.zip from Releases
# 2. Unzip and copy to Applications:
cp -r Pulse.app /Applications/
open /Applications/Pulse.app
```

New releases are built automatically when a `pulse-v*` tag is pushed.

### Harmless Budget

Install from [GitHub Releases](https://github.com/harmssam/workbench/releases) or build from source — see [apps/harmless-budget/README.md](apps/harmless-budget/README.md).

```bash
# Install a release build
# 1. Download Harmless-Budget-v0.1.0-macos-arm64.zip from Releases
# 2. Unzip and copy to Applications:
cp -r "Harmless Budget.app" /Applications/
open "/Applications/Harmless Budget.app"
```

New releases are built automatically when a `harmless-budget-v*` tag is pushed.

## Requirements

- macOS 14+ for GUI applications
- Toolchain details are documented in each project's README

## License

MIT — see [LICENSE](LICENSE).