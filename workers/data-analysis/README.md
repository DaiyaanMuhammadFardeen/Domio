# data-analysis — Data-to-Story Statistical Analysis

Sandboxed statistical analysis producing structured Findings for Domio slides. Pure library + CLI, no DB, no NATS.

## Quick Start

```bash
cd workers/data-analysis
pip install -e ".[dev]"
python -m data_analysis --help
```

## CLI Usage

```bash
# Analyse numeric series from a JSON file
python -m data_analysis input.json
```

Where `input.json` looks like:

```json
{
  "series": {
    "revenue": [100, 200, 300, 400, 500],
    "costs": [50, 60, 70, 80, 90]
  }
}
```

## Architecture

```
data_analysis/
├── __init__.py       # Package
├── __main__.py       # CLI entry point
├── stats.py          # Correlation, Mann-Kendall trend, IQR/z-score outliers
└── findings.py       # Finding dataclass + summarise() auto-analysis
```

## Row-Level Security Note

This library **never reads PII**. All inputs are strictly numeric series (`dict[str, list[float]]`). No PII fields are accepted or processed.

## Development

```bash
pip install -e ".[dev]"
pytest tests/          # Run tests
ruff check .           # Lint
mypy src/              # Type check
```

## Optional Dependencies

| Extra   | Purpose                                          |
| ------- | ------------------------------------------------ |
| `scipy` | Enables p-values for correlation and trend tests |

Pure-Python fallbacks are always available — scipy is optional.
