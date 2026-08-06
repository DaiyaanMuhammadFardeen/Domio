"""Pydantic models for the AI evaluation harness."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class GoldenCase(BaseModel):
    """A single golden test case for evaluating a prompt template."""

    case_id: str = Field(..., description="Unique identifier for this case")
    template_id: str = Field(
        ..., description="Template ID from prompt-registry (e.g. outline.from_prompt)"
    )
    version: str = Field(..., description="Template version this case targets")
    input: dict[str, Any] = Field(default_factory=dict, description="Input parameters")
    rendered_prompt: str = Field(
        ..., description="The fully rendered prompt text (self-contained, no cross-lang deps)"
    )
    expected: dict[str, Any] | None = Field(
        default=None, description="Expected output structure (exact match or partial)"
    )
    judge: str | None = Field(
        default=None,
        description="If set, use LLM-as-judge. Value is the judge rubric override or 'default'.",
    )


class GoldenSet(BaseModel):
    """A collection of golden cases for a specific evaluation."""

    id: str = Field(..., description="Golden set identifier (e.g. eval-outline-basic-v1)")
    cases: list[GoldenCase] = Field(default_factory=list)


class EvalResult(BaseModel):
    """Result of evaluating a single golden case."""

    case_id: str
    passed: bool
    score: float = Field(default=1.0, ge=0.0, le=1.0)
    notes: str = ""
