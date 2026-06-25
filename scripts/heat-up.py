#!/usr/bin/env python3
"""Stress CPU (all but one core) and GPU to raise system temperature.

Runs for 5 minutes or until SIGINT/SIGTERM.
"""

from __future__ import annotations

import atexit
import os
import signal
import subprocess
import sys
import time

DURATION_SEC = 5 * 60
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GPU_SCRIPT = os.path.join(SCRIPT_DIR, "gpu-stress.swift")

CPU_BURN = r"""
import signal, sys
running = True
def stop(*_): 
    global running
    running = False
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
x = 1.0
while running:
    for _ in range(1000):
        if not running:
            break
        x = (x * 1.0000001 + 0.0000001) % 1_000_000.0
"""


class StressRun:
    def __init__(self) -> None:
        self.cpu_procs: list[subprocess.Popen[bytes]] = []
        self.gpu_proc: subprocess.Popen[bytes] | None = None
        self._cleaned = False

    def cleanup(self) -> None:
        if self._cleaned:
            return
        self._cleaned = True

        for proc in self.cpu_procs:
            _kill_tree(proc)

        if self.gpu_proc is not None:
            _kill_tree(self.gpu_proc)

        self.cpu_procs.clear()
        self.gpu_proc = None


def _kill_tree(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return

    pid = proc.pid
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass

    try:
        proc.kill()
    except ProcessLookupError:
        pass

    try:
        proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def main() -> int:
    run = StressRun()
    atexit.register(run.cleanup)

    def shutdown(_signum: int | None = None, _frame: object | None = None) -> None:
        run.cleanup()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    ncpu = os.cpu_count() or 4
    workers = max(1, ncpu - 1)

    print(f"Heating up: {workers} CPU workers + GPU for {DURATION_SEC // 60} min (Ctrl+C to stop)")

    for _ in range(workers):
        proc = subprocess.Popen(
            [sys.executable, "-c", CPU_BURN],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        run.cpu_procs.append(proc)

    if sys.platform == "darwin" and os.path.isfile(GPU_SCRIPT):
        try:
            run.gpu_proc = subprocess.Popen(
                ["swift", GPU_SCRIPT],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as exc:
            print(f"GPU stress skipped: {exc}", file=sys.stderr)
    else:
        print("GPU stress skipped (macOS + gpu-stress.swift required)", file=sys.stderr)

    deadline = time.monotonic() + DURATION_SEC
    stopped_early = False

    try:
        while time.monotonic() < deadline:
            for proc in run.cpu_procs:
                if proc.poll() is not None:
                    print("A CPU worker exited early", file=sys.stderr)
                    stopped_early = True
                    break

            if stopped_early:
                break

            if run.gpu_proc is not None and run.gpu_proc.poll() is not None:
                print("GPU stress exited early", file=sys.stderr)
                stopped_early = True
                break

            time.sleep(0.25)
    except KeyboardInterrupt:
        stopped_early = True
    finally:
        run.cleanup()

    if stopped_early:
        print("Stopped")
    else:
        print("Done — 5 minute limit reached")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())