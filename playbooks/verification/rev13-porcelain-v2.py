#!/usr/bin/env python3
"""REV-13 R3.5 NUL-safe Git Porcelain V2 Parser.

Reads raw bytes from stdin (git status --porcelain=v2 -z), parses records
per Git protocol, outputs structured JSON. Never stores NUL in bash variables.

Usage:
    git status --porcelain=v2 -z | python3 rev13-porcelain-v2.py
"""
import sys
import json


def parse_porcelain_v2(raw: bytes) -> dict:
    """Parse NUL-delimited porcelain v2 output into structured records."""
    # Split on NUL, filter empty
    fields = raw.split(b"\x00")
    entries = []
    i = 0
    branch_info = {}

    while i < len(fields):
        field = fields[i]
        if not field:
            i += 1
            continue

        line = field.decode("utf-8", errors="replace")

        # Branch header lines start with #
        if line.startswith("#"):
            parts = line.split(" ", 2)
            if len(parts) >= 2:
                key = parts[1].rstrip(".")
                val = parts[2] if len(parts) > 2 else ""
                branch_info[key] = val
            i += 1
            continue

        # Record type is first char
        rtype = line[0] if line else ""

        if rtype == "1":
            # Ordinary entry: 1 XY sub mH mI mW hH hI path
            parts = line.split(" ")
            entry = {
                "record_type": "ordinary",
                "xy": parts[1] if len(parts) > 1 else "",
                "sub": parts[2] if len(parts) > 2 else "",
                "mode_head": parts[3] if len(parts) > 3 else "",
                "mode_index": parts[4] if len(parts) > 4 else "",
                "mode_worktree": parts[5] if len(parts) > 5 else "",
                "sha_head": parts[6] if len(parts) > 6 else "",
                "sha_index": parts[7] if len(parts) > 7 else "",
                "path": parts[8] if len(parts) > 8 else "",
            }
            entries.append(entry)
            i += 1

        elif rtype == "2":
            # Rename/copy: 2 XY sub mH mI mW hH hI score path1\0path2
            parts = line.split(" ")
            path1 = parts[8] if len(parts) > 8 else ""
            # Next field is path2 (NUL-delimited)
            path2 = ""
            if i + 1 < len(fields) and fields[i + 1]:
                path2 = fields[i + 1].decode("utf-8", errors="replace")
                i += 1
            entry = {
                "record_type": "rename_or_copy",
                "xy": parts[1] if len(parts) > 1 else "",
                "score": parts[7] if len(parts) > 7 else "",
                "path": path1,
                "original_path": path2,
            }
            entries.append(entry)
            i += 1

        elif rtype == "u":
            # Unmerged: u XY sub m1 m2 m3 wW h1 h2 h3 path
            parts = line.split(" ")
            entry = {
                "record_type": "unmerged",
                "xy": parts[1] if len(parts) > 1 else "",
                "path": parts[10] if len(parts) > 10 else "",
            }
            entries.append(entry)
            i += 1

        elif rtype == "?":
            # Untracked: ? path
            path = line[2:] if len(line) > 2 else ""
            entries.append({"record_type": "untracked", "path": path})
            i += 1

        else:
            entries.append({"record_type": "unknown", "raw": line})
            i += 1

    return {
        "branch": branch_info,
        "entry_count": len(entries),
        "entries": entries,
    }


def main():
    raw = sys.stdin.buffer.read()
    result = parse_porcelain_v2(raw)
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
