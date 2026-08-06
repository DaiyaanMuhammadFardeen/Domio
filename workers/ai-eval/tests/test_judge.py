"""Tests for the judge module."""
from __future__ import annotations

import os

from ai_eval.judge import LLMJudge


def test_judge_skipped_by_default() -> None:
    """Test that the judge is skipped when EVAL_RUN_JUDGE is not set."""
    # Ensure the env var is not set.
    os.environ.pop("EVAL_RUN_JUDGE", None)

    judge = LLMJudge(base_url="http://localhost:9999")
    score, reasoning = judge.score("prompt", "output")

    assert score == 0.0
    assert "skipped" in reasoning
    judge.close()


def test_judge_skipped_with_flag_unset() -> None:
    """Test judge skipped when flag is explicitly '0'."""
    os.environ["EVAL_RUN_JUDGE"] = "0"
    try:
        judge = LLMJudge(base_url="http://localhost:9999")
        score, reasoning = judge.score("prompt", "output")
        assert score == 0.0
        assert "skipped" in reasoning
        judge.close()
    finally:
        os.environ.pop("EVAL_RUN_JUDGE", None)


def test_judge_custom_rubric() -> None:
    """Test that custom rubric is accepted (still skipped in M1)."""
    os.environ.pop("EVAL_RUN_JUDGE", None)
    judge = LLMJudge(base_url="http://localhost:9999")
    score, reasoning = judge.score("prompt", "output", rubric="Custom rubric here")
    assert score == 0.0
    assert "skipped" in reasoning
    judge.close()
