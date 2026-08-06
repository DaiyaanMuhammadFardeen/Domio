"""Registry — discover and validate golden sets from fixture files."""
from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from ai_eval.models import GoldenCase, GoldenSet


def load_jsonl(path: Path) -> Iterator[dict[str, object]]:
    """Yield dicts from a JSONL file, skipping blank/comment lines."""
    with path.open() as f:
        for line_no, raw in enumerate(f, 1):
            stripped = raw.strip()
            if not stripped or stripped.startswith("#"):
                continue
            try:
                yield json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON at {path}:{line_no}: {exc}") from exc


def load_json(path: Path) -> list[dict[str, object]]:
    """Load a JSON file containing a list of case dicts."""
    with path.open() as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array in {path}, got {type(data).__name__}")
    return data


def discover_golden_sets(fixtures_dir: Path) -> list[GoldenSet]:
    """Discover all golden sets from *.jsonl or *.json files in *fixtures_dir*.

    Each file must contain cases that share the same ``template_id``.
    The golden set ``id`` is derived from the filename stem.
    """
    sets: list[GoldenSet] = []
    for path in sorted(fixtures_dir.iterdir()):
        if path.suffix == ".jsonl":
            raw_cases = list(load_jsonl(path))
        elif path.suffix == ".json":
            raw_cases = load_json(path)
        else:
            continue

        cases = [GoldenCase.model_validate(c) for c in raw_cases]
        gs = GoldenSet(id=path.stem, cases=cases)
        sets.append(gs)
    return sets


def get_golden_sets(
    fixtures_dir: Path, *, set_id: str | None = None
) -> list[GoldenSet]:
    """Return golden sets, optionally filtered by *set_id*."""
    all_sets = discover_golden_sets(fixtures_dir)
    if set_id is not None:
        all_sets = [gs for gs in all_sets if gs.id == set_id]
    return all_sets
