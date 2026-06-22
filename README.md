# workbench

Personal apps and scripts — separate from [Clevertech](https://github.com/harmssam/Clevertech_v1).

Each project lives under `apps/` or `scripts/`. One-off utilities go in `scripts/`; anything with its own UI, lifecycle, or distribution story goes in `apps/`.

## Structure

```
apps/       # standalone applications (menu bar apps, CLIs with their own repo-style layout)
scripts/    # one-off or utility scripts
docs/       # cross-cutting notes (optional)
```

## Apps

| App | Description | Status |
|-----|-------------|--------|
| [Pulse](apps/pulse/) | macOS menu bar network, disk, CPU, and GPU monitor | MVP |

## Requirements

- macOS (primary target for GUI apps)
- Per-app READMEs list language-specific tooling

## License

MIT — see [LICENSE](LICENSE).