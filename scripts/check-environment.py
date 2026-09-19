#!/usr/bin/env python3
"""Verify the Node, Python, shell, and visual-audit toolchain."""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
checks = {
    "node": shutil.which("node"),
    "npm": shutil.which("npm"),
    "python3": shutil.which("python3"),
    "bash": shutil.which("bash"),
    "ffmpeg": shutil.which("ffmpeg"),
    "package lock": (root / "package-lock.json").exists(),
    "step6 audit": (root / "step6-a/audit/l0-pixel-audit.py").exists(),
}
for name, value in checks.items():
    print(f"{name}: {'ok' if value else 'missing'}")
if not all(checks.values()):
    raise SystemExit(1)
for tool, args in (("node", ("--version",)), ("python3", ("--version",))):
    result = subprocess.run([tool, *args], capture_output=True, text=True, check=True)
    print(f"{tool}_version: {result.stdout.strip() or result.stderr.strip()}")
print("environment: ready")
