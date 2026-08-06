"""Tests for the golden set registry."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_eval.registry import discover_golden_sets, get_golden_sets, load_jsonl


def test_load_jsonl(tmp_path: Path) -> None:
    """Test JSONL loading."""
    p = tmp_path / "test.jsonl"
    p.write_text('{"a": 1}\n{"b": 2}\n\n# comment\n{"c": 3}\n')
    items = list(load_jsonl(p))
    assert len(items) == 3
    assert items[0] == {"a": 1}
    assert items[2] == {"c": 3}


def test_load_jsonl_invalid(tmp_path: Path) -> None:
    """Test that invalid JSON raises ValueError."""
    p = tmp_path / "bad.jsonl"
    p.write_text("not json\n")
    with pytest.raises(ValueError, match="Invalid JSON"):
        list(load_jsonl(p))


def test_discover_golden_sets(tmp_path: Path) -> None:
    """Test discovery of golden sets from fixture files."""
    # Create a JSONL fixture.
    jsonl = tmp_path / "eval-test-v1.jsonl"
    cases = [
        {
            "case_id": "c1",
            "template_id": "outline.from_prompt",
            "version": "v1",
            "input": {"topic": "AI"},
            "rendered_prompt": "Write an outline about AI",
            "expected": {"text": "outline output"},
        },
        {
            "case_id": "c2",
            "template_id": "outline.from_prompt",
            "version": "v1",
            "input": {"topic": "ML"},
            "rendered_prompt": "Write an outline about ML",
        },
    ]
    jsonl.write_text("\n".join(json.dumps(c) for c in cases))

    # Create a JSON fixture.
    json_file = tmp_path / "eval-other-v1.json"
    json_file.write_text(json.dumps([
        {
            "case_id": "c3",
            "template_id": "accessibility.alt_text",
            "version": "v1",
            "input": {"image_description": "cat"},
            "rendered_prompt": "Generate alt text for: cat",
            "expected": {"contains": ["cat"]},
        }
    ]))

    sets = discover_golden_sets(tmp_path)
    assert len(sets) == 2

    # Find the JSONL set.
    jsonl_set = next(gs for gs in sets if gs.id == "eval-test-v1")
    assert len(jsonl_set.cases) == 2
    assert jsonl_set.cases[0].case_id == "c1"

    # Find the JSON set.
    json_set = next(gs for gs in sets if gs.id == "eval-other-v1")
    assert len(json_set.cases) == 1
    assert json_set.cases[0].template_id == "accessibility.alt_text"


def test_get_golden_sets_filter(tmp_path: Path) -> None:
    """Test filtering by set_id."""
    p = tmp_path / "eval-a-v1.jsonl"
    p.write_text(json.dumps({
        "case_id": "x",
        "template_id": "t",
        "version": "v1",
        "rendered_prompt": "hello",
    }) + "\n")

    p2 = tmp_path / "eval-b-v1.jsonl"
    p2.write_text(json.dumps({
        "case_id": "y",
        "template_id": "t",
        "version": "v1",
        "rendered_prompt": "world",
    }) + "\n")

    all_sets = get_golden_sets(tmp_path)
    assert len(all_sets) == 2

    filtered = get_golden_sets(tmp_path, set_id="eval-a-v1")
    assert len(filtered) == 1
    assert filtered[0].id == "eval-a-v1"


def test_empty_fixtures_dir(tmp_path: Path) -> None:
    """Test with empty fixtures directory."""
    sets = discover_golden_sets(tmp_path)
    assert sets == []
