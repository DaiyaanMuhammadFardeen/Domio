"""Tests for the runner module."""
from __future__ import annotations

from ai_eval.models import GoldenCase
from ai_eval.runner import MockProvider, evaluate_case


def test_mock_provider_basic() -> None:
    """Test MockProvider returns deterministic responses."""
    provider = MockProvider({"hello": "world"})
    assert provider.generate("hello") == "world"
    assert provider.generate("goodbye") == "mock response for prompt of length 7"
    assert len(provider.calls) == 2


def test_evaluate_case_pass() -> None:
    """Test a case that should pass (exact match)."""
    case = GoldenCase(
        case_id="test-1",
        template_id="outline.from_prompt",
        version="v1",
        rendered_prompt="Generate outline",
        expected={"text": "mock response for prompt of length 16"},
    )
    provider = MockProvider()
    result = evaluate_case(case, provider)

    assert result.passed is True
    assert result.score == 1.0


def test_evaluate_case_fail() -> None:
    """Test a case that should fail (mismatch)."""
    case = GoldenCase(
        case_id="test-2",
        template_id="outline.from_prompt",
        version="v1",
        rendered_prompt="Generate outline",
        expected={"text": "this will not match"},
    )
    provider = MockProvider()
    result = evaluate_case(case, provider)

    assert result.passed is False
    assert result.score == 0.0


def test_evaluate_case_contains() -> None:
    """Test contains matching."""
    case = GoldenCase(
        case_id="test-3",
        template_id="outline.from_prompt",
        version="v1",
        rendered_prompt="test",
        expected={"contains": ["mock", "length"]},
    )
    provider = MockProvider()
    result = evaluate_case(case, provider)

    assert result.passed is True
    assert result.score == 1.0


def test_evaluate_case_no_expected() -> None:
    """Test case with no expected output passes if output is generated."""
    case = GoldenCase(
        case_id="test-4",
        template_id="outline.from_prompt",
        version="v1",
        rendered_prompt="Generate something",
    )
    provider = MockProvider()
    result = evaluate_case(case, provider)

    assert result.passed is True
    assert result.score == 1.0


def test_evaluate_case_contains_missing() -> None:
    """Test contains matching with missing substrings."""
    case = GoldenCase(
        case_id="test-5",
        template_id="outline.from_prompt",
        version="v1",
        rendered_prompt="test",
        expected={"contains": ["xyz", "missing"]},
    )
    provider = MockProvider()
    result = evaluate_case(case, provider)

    assert result.passed is False
    assert "missing substrings" in result.notes


def test_full_evaluation_cycle() -> None:
    """Test a full evaluation cycle with multiple cases."""
    from ai_eval.models import GoldenSet
    from ai_eval.runner import evaluate_case

    gs = GoldenSet(
        id="test-set",
        cases=[
            GoldenCase(
                case_id="pass-case",
                template_id="t",
                version="v1",
                rendered_prompt="hello",
                expected={"text": "mock response for prompt of length 5"},
            ),
            GoldenCase(
                case_id="fail-case",
                template_id="t",
                version="v1",
                rendered_prompt="hello",
                expected={"text": "wrong"},
            ),
        ],
    )

    provider = MockProvider()
    results = [evaluate_case(c, provider) for c in gs.cases]

    assert len(results) == 2
    assert results[0].passed is True
    assert results[1].passed is False
