"""Tests for the ingest-docs chunker module."""
from __future__ import annotations

from ingest_docs.chunker import chunk_text


def test_chunker_respects_max_tokens() -> None:
    """All chunks must have token_count <= max_tokens."""
    # ~3200 chars → ~800 tokens at 4 chars/token
    text = "word " * 3200
    chunks = chunk_text(text, max_tokens=200)
    for c in chunks:
        assert c["token_count"] <= 200, f"Chunk {c['chunk_index']} exceeds max_tokens"  # type: ignore[operator]


def test_chunker_sets_sections() -> None:
    """Heading-based sections are propagated into chunk metadata."""
    text = "# Introduction\nHello world.\n\n# Body\nMore content here."
    chunks = chunk_text(text, max_tokens=800)
    sections = [c["section"] for c in chunks]
    assert "Introduction" in sections
    assert "Body" in sections


def test_chunker_single_short_text() -> None:
    """A single short paragraph produces one chunk."""
    chunks = chunk_text("Short text.", max_tokens=800)
    assert len(chunks) == 1
    assert chunks[0]["text"] == "Short text."
    assert chunks[0]["token_count"] >= 1  # type: ignore[operator]  # noqa: E501


def test_chunker_sequential_index() -> None:
    """Chunk indices are sequential starting from start_index."""
    text = "# A\nFirst.\n\n# B\nSecond."
    chunks = chunk_text(text, max_tokens=800, start_index=5)
    indices = [c["chunk_index"] for c in chunks]
    assert indices == [5, 6]


def test_chunker_empty_text() -> None:
    """Empty text yields no chunks."""
    chunks = chunk_text("", max_tokens=800)
    assert chunks == []
