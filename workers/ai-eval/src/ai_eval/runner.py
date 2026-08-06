"""Runner — execute golden cases against providers and compare outputs."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ai_eval.models import EvalResult, GoldenCase


class ProviderClient(ABC):
    """Interface for model providers. M1 ships a mock; real APIs plug in later."""

    @abstractmethod
    def generate(self, prompt: str, *, temperature: float = 0.0) -> str:
        """Send *prompt* to the model and return the text response."""
        ...


class MockProvider(ProviderClient):
    """Deterministic in-process provider for testing."""

    def __init__(self, responses: dict[str, str] | None = None) -> None:
        self._responses = responses or {}
        self._calls: list[str] = []

    def generate(self, prompt: str, *, temperature: float = 0.0) -> str:
        self._calls.append(prompt)
        # Return configured response or a deterministic echo.
        for key, val in self._responses.items():
            if key in prompt:
                return val
        return f"mock response for prompt of length {len(prompt)}"

    @property
    def calls(self) -> list[str]:
        return list(self._calls)


def _exact_match(actual: str, expected: dict[str, Any]) -> tuple[bool, float, str]:
    """Check if the output matches expected exactly."""
    expected_text = expected.get("text")
    if expected_text is None:
        return True, 1.0, "no expected text to match"
    if actual.strip() == str(expected_text).strip():
        return True, 1.0, "exact match"
    return False, 0.0, f"mismatch: expected {expected_text!r}, got {actual!r}"


def _contains_match(actual: str, expected: dict[str, Any]) -> tuple[bool, float, str]:
    """Check if the output contains all required substrings."""
    required = expected.get("contains", [])
    if not required:
        return True, 1.0, "no required substrings"
    missing = [r for r in required if r not in actual]
    if not missing:
        return True, 1.0, "all substrings present"
    return False, 0.0, f"missing substrings: {missing}"


def evaluate_case(
    case: GoldenCase,
    provider: ProviderClient,
) -> EvalResult:
    """Run a single golden case through the provider and score the result."""
    output = provider.generate(case.rendered_prompt)

    if case.expected is None:
        # No expected output — pass if we got any response.
        passed = bool(output.strip())
        return EvalResult(
            case_id=case.case_id,
            passed=passed,
            score=1.0 if passed else 0.0,
            notes="no expected output configured" if not passed else "output generated",
        )

    # Try exact match if 'text' is present.
    if "text" in case.expected:
        passed, score, notes = _exact_match(output, case.expected)
        if passed:
            return EvalResult(case_id=case.case_id, passed=True, score=score, notes=notes)
        return EvalResult(case_id=case.case_id, passed=False, score=0.0, notes=notes)

    # Try contains match if 'contains' is present.
    if "contains" in case.expected:
        passed, score, notes = _contains_match(output, case.expected)
        return EvalResult(case_id=case.case_id, passed=passed, score=score, notes=notes)

    # Unknown expected format — pass.
    return EvalResult(case_id=case.case_id, passed=True, score=1.0, notes="unknown expected format")
