# scripts

Small scripts and applications — separate from [Clevertech](https://github.com/harmssam/Clevertech_v1).

Each app or tool lives under `apps/` or `scripts/`. One-off utilities go in `scripts/`; anything with its own UI, lifecycle, or distribution story goes in `apps/`.

## Structure

```
apps/       # standalone applications (menu bar apps, CLIs with their own repo-style layout)
scripts/    # one-off or utility scripts
docs/       # cross-cutting notes (optional)
```

## Apps

| App | Description | Status |
|-----|-------------|--------|
| [sysmon](apps/sysmon/) | macOS menu bar network + disk activity monitor | MVP |

## Requirements

- macOS (primary target for GUI apps)
- Per-app READMEs list language-specific tooling

## License

MIT — see [LICENSE](LICENSE).