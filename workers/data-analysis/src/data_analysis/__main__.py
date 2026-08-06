"""CLI entry point for data-analysis.

Usage:
    python -m data_analysis <json-file>

Where *json-file* contains:
    {"series": {"revenue": [...], "costs": [...]}}

Prints a JSON list of Findings to stdout.

Row-level security note: this library never reads PII; all inputs are
numeric series only.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from data_analysis.findings import summarise


def main(argv: list[str] | None = None) -> int:
    """Main entry point. Returns exit code 0 on success, 1 on failure."""
    parser = argparse.ArgumentParser(
        prog="data-analysis",
        description="Sandboxed statistical analysis producing Findings for slides.",
    )
    parser.add_argument("json_file", help="Path to JSON file with numeric series")
    args = parser.parse_args(argv)

    path = Path(args.json_file)
    if not path.is_file():
        print(f"Error: file not found: {path}", file=sys.stderr)
        return 1

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON: {exc}", file=sys.stderr)
        return 1

    series = raw.get("series", raw)
    if not isinstance(series, dict):
        print("Error: expected a dict of numeric series", file=sys.stderr)
        return 1

    # Ensure all values are lists of floats.
    cleaned: dict[str, list[float]] = {}
    for name, values in series.items():
        if not isinstance(values, list):
            print(f"Error: series '{name}' is not a list", file=sys.stderr)
            return 1
        cleaned[name] = [float(v) for v in values]

    findings = summarise(cleaned)
    output = [asdict(f) for f in findings]
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
