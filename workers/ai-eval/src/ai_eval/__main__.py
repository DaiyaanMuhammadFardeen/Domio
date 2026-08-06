"""CLI entry point for the AI evaluation harness.

Usage:
    python -m ai_eval [--set <id>] [--fixtures <dir>]

Prints a pass/fail summary and exits non-zero on any failure.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ai_eval.models import EvalResult, GoldenSet
from ai_eval.registry import get_golden_sets
from ai_eval.runner import MockProvider, ProviderClient, evaluate_case


def run_evaluation(
    golden_sets: list[GoldenSet],
    provider: ProviderClient,
) -> list[EvalResult]:
    """Evaluate all cases in all golden sets."""
    results: list[EvalResult] = []
    for gs in golden_sets:
        for case in gs.cases:
            result = evaluate_case(case, provider)
            results.append(result)
    return results


def print_summary(results: list[EvalResult], golden_sets: list[GoldenSet]) -> None:
    """Print a human-readable summary."""
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    print(f"\n{'=' * 60}")
    print(f"  AI Eval Results: {passed}/{total} passed")
    print(f"{'=' * 60}")

    for gs in golden_sets:
        print(f"\n  [{gs.id}]")
        for case in gs.cases:
            # Find matching result.
            result = next((r for r in results if r.case_id == case.case_id), None)
            if result is None:
                print(f"    {case.case_id}: MISSING")
                continue
            status = "PASS" if result.passed else "FAIL"
            print(f"    {case.case_id}: {status} (score={result.score:.2f}) {result.notes}")

    print(f"\n{'=' * 60}")
    if failed > 0:
        print(f"  FAILED: {failed} case(s) failed")
    else:
        print("  ALL PASSED")
    print(f"{'=' * 60}\n")


def main(argv: list[str] | None = None) -> int:
    """Main entry point. Returns exit code (0=pass, 1=fail)."""
    parser = argparse.ArgumentParser(
        prog="ai-eval",
        description="AI evaluation harness for prompt template regression testing.",
    )
    parser.add_argument(
        "--set",
        dest="set_id",
        default=None,
        help="Run only the golden set with this ID",
    )
    parser.add_argument(
        "--fixtures",
        dest="fixtures_dir",
        default=None,
        help="Path to fixtures directory (default: <package>/fixtures/)",
    )
    args = parser.parse_args(argv)

    if args.fixtures_dir:
        fixtures_dir = Path(args.fixtures_dir)
    else:
        fixtures_dir = Path(__file__).parent.parent.parent / "fixtures"
    if not fixtures_dir.is_dir():
        print(f"Error: fixtures directory not found: {fixtures_dir}", file=sys.stderr)
        return 1

    golden_sets = get_golden_sets(fixtures_dir, set_id=args.set_id)
    if not golden_sets:
        print(f"No golden sets found in {fixtures_dir}", file=sys.stderr)
        return 1

    # M1: use MockProvider. Real provider wiring is M2.
    provider = MockProvider()

    results = run_evaluation(golden_sets, provider)
    print_summary(results, golden_sets)

    failed = sum(1 for r in results if not r.passed)
    return 1 if failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
