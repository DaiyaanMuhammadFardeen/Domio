"""Judge — LLM-as-judge scaffolding for evaluating output quality."""
from __future__ import annotations

import os
from abc import ABC, abstractmethod

import httpx

# Scoring rubric used by the LLM judge.
DEFAULT_RUBRIC = """\
You are evaluating an AI-generated response. Score it on these criteria:
1. Relevance (0.0-1.0): Does the response address the prompt?
2. Completeness (0.0-1.0): Does it cover all requested aspects?
3. Quality (0.0-1.0): Is the writing clear and well-structured?

Return a JSON object: {"score": <float>, "reasoning": "<brief explanation>"}
"""


class JudgeClient(ABC):
    """Interface for LLM-as-judge implementations."""

    @abstractmethod
    def score(self, prompt: str, output: str, *, rubric: str | None = None) -> tuple[float, str]:
        """Score *output* given *prompt*. Returns (score, reasoning)."""
        ...


class LLMJudge(JudgeClient):
    """LLM-as-judge using an OpenAI-compatible /v1/chat/completions endpoint."""

    def __init__(
        self,
        *,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str = "https://api.openai.com",
    ) -> None:
        self._model = model or os.environ.get("AI_EVAL_JUDGE_MODEL", "openai/gpt-5.2-mini")
        self._api_key = api_key or os.environ.get("AI_EVAL_JUDGE_API_KEY", "")
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=30.0)

    def score(self, prompt: str, output: str, *, rubric: str | None = None) -> tuple[float, str]:
        """Call the LLM judge and parse the score.

        NOTE: M1 ships the plumbing. The actual scoring call is gated
        behind EVAL_RUN_JUDGE=1; default behaviour is to skip.
        """
        if os.environ.get("EVAL_RUN_JUDGE") != "1":
            return 0.0, "judge skipped (set EVAL_RUN_JUDGE=1 to enable)"

        rubric_text = rubric or DEFAULT_RUBRIC

        system_msg = (
            "You are a strict evaluation judge. "
            "Score the AI response based on the rubric below.\n\n"
            f"{rubric_text}"
        )
        user_msg = (
            f"## Prompt\n{prompt}\n\n"
            f"## AI Response\n{output}\n\n"
            "Score the response. Return JSON with 'score' and 'reasoning' keys."
        )

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.0,
        }

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        try:
            resp = self._client.post(
                f"{self._base_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            body = resp.json()
            content = body["choices"][0]["message"]["content"]
            # Try to parse JSON from the response.
            import json

            parsed = json.loads(content)
            return float(parsed.get("score", 0.0)), parsed.get("reasoning", "")
        except Exception as exc:
            return 0.0, f"judge error: {exc}"

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()
