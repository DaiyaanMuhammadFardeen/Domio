# ai-eval — AI Evaluation Harness

Golden-set regression testing for Domio's prompt templates. This harness blocks prompt-template regressions in CI by comparing model outputs against known-good expected results.

## Quick Start

```bash
cd workers/ai-eval
pip install -e ".[dev]"
python -m ai_eval
```

## How It Works

1. **Golden Sets** (`fixtures/*.jsonl`) define test cases with:

   - `template_id` — which prompt template to evaluate (e.g., `outline.from_prompt`)
   - `rendered_prompt` — the fully rendered prompt text (self-contained)
   - `expected` — expected output (exact match or substring containment)

2. **Runner** sends each `rendered_prompt` to a provider and compares the output against `expected`.

3. **Judge** (optional) uses an LLM-as-judge for quality scoring. Gated behind `EVAL_RUN_JUDGE=1` — disabled by default in M1.

4. **CLI** prints pass/fail summary and exits non-zero on failures.

## CLI Usage

```bash
# Run all golden sets
python -m ai_eval

# Run a specific golden set
python -m ai_eval --set eval-outline-basic-v1

# Specify custom fixtures directory
python -m ai_eval --fixtures /path/to/fixtures
```

## Fixture Format

Each `.jsonl` file contains one JSON object per line:

```json
{
  "case_id": "outline-basic-1",
  "template_id": "outline.from_prompt",
  "version": "v1",
  "input": { "topic": "AI", "audience": "engineers" },
  "rendered_prompt": "Create a structured outline...",
  "expected": { "contains": ["Introduction", "conclusion"] }
}
```

### Expected Output Matching

- `{"text": "exact match"}` — output must match exactly
- `{"contains": ["sub1", "sub2"]}` — output must contain all substrings
- No `expected` field — passes if any output is generated

## CI Gating

Add to your CI pipeline:

```yaml
- name: AI Eval
  run: |
    cd workers/ai-eval
    pip install -e .
    python -m ai_eval
```

The harness exits non-zero when any golden case fails, blocking the merge.

## Architecture

```
ai_eval/
├── __init__.py       # Package
├── __main__.py       # CLI entry point
├── models.py         # Pydantic models (GoldenCase, GoldenSet, EvalResult)
├── registry.py       # Discover/validate golden sets from fixtures
├── runner.py         # ProviderClient interface + MockProvider + evaluate_case
├── judge.py          # JudgeClient interface + LLMJudge (gated by env flag)
├── fixtures/         # Golden set files (*.jsonl)
└── tests/            # pytest tests
```

## Environment Variables

| Variable                | Default               | Description                            |
| ----------------------- | --------------------- | -------------------------------------- |
| `AI_EVAL_JUDGE_MODEL`   | `openai/gpt-5.2-mini` | Model for LLM-as-judge                 |
| `AI_EVAL_JUDGE_API_KEY` | (none)                | API key for judge model                |
| `EVAL_RUN_JUDGE`        | `0`                   | Set to `1` to enable LLM judge scoring |

## Development

```bash
pip install -e ".[dev]"
pytest tests/          # Run tests
ruff check .           # Lint
mypy src/              # Type check
```

## Golden Sets

| Set ID                  | Template                 | Cases |
| ----------------------- | ------------------------ | ----- |
| `eval-outline-basic-v1` | `outline.from_prompt`    | 3     |
| `eval-alttext-basic-v1` | `accessibility.alt_text` | 3     |
