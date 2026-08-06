"""Text chunking — split extracted documents into token-bounded chunks."""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    """A single chunk of text from a document."""

    chunk_index: int
    text: str
    token_count: int
    section: str | None = None
    page: int | None = None


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)")


def _split_long_line(line: str, max_tokens: int) -> list[str]:
    """Split a single line that exceeds *max_tokens* into word-level pieces.

    Uses character budget (max_tokens * 4) to guarantee each piece fits.
    """
    char_budget = max_tokens * 4
    words = line.split()
    pieces: list[str] = []
    buf: list[str] = []
    buf_len = 0
    for w in words:
        added_len = len(w) + (1 if buf else 0)  # space before if not first
        if buf and buf_len + added_len > char_budget:
            pieces.append(" ".join(buf))
            buf = [w]
            buf_len = len(w)
        else:
            buf.append(w)
            buf_len += added_len
    if buf:
        pieces.append(" ".join(buf))
    return pieces


def chunk_text(
    text: str,
    *,
    max_tokens: int = 800,
    start_index: int = 0,
) -> list[dict[str, object]]:
    """Split *text* into chunks of at most *max_tokens*.

    Heading-based segmentation: when a Markdown heading is encountered it
    starts a new section.  The section name is carried into every chunk
    belonging to that section.

    Returns a list of dicts matching the ``source.ref.chunks`` JSONB schema:
    ``{chunk_index, section?, text, token_count}``
    """
    if not text.strip():
        return []

    lines = text.split("\n")
    sections: list[tuple[str | None, list[str]]] = []
    current_section: str | None = None
    current_lines: list[str] = []

    for line in lines:
        m = _HEADING_RE.match(line)
        if m:
            # Start a new section.
            if current_lines:
                sections.append((current_section, current_lines))
            current_section = m.group(2).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_section, current_lines))

    # Now chunk each section, respecting max_tokens.
    chunks: list[dict[str, object]] = []
    idx = start_index
    for section_name, section_lines in sections:
        section_text = "\n".join(section_lines)
        section_tokens = _estimate_tokens(section_text)
        if section_tokens <= max_tokens:
            chunks.append({
                "chunk_index": idx,
                "section": section_name,
                "text": section_text,
                "token_count": section_tokens,
            })
            idx += 1
        else:
            # Sub-chunk by lines; if a single line exceeds max_tokens,
            # split it into word-level pieces.
            buf: list[str] = []
            buf_tokens = 0
            for line in section_lines:
                line_tokens = _estimate_tokens(line)
                if line_tokens > max_tokens:
                    # Flush the buffer first.
                    if buf:
                        chunk_str = "\n".join(buf)
                        chunks.append({
                            "chunk_index": idx,
                            "section": section_name,
                            "text": chunk_str,
                            "token_count": buf_tokens,
                        })
                        idx += 1
                        buf = []
                        buf_tokens = 0
                    # Split the long line into sub-pieces.
                    for piece in _split_long_line(line, max_tokens):
                        chunks.append({
                            "chunk_index": idx,
                            "section": section_name,
                            "text": piece,
                            "token_count": _estimate_tokens(piece),
                        })
                        idx += 1
                elif buf and buf_tokens + line_tokens > max_tokens:
                    chunk_str = "\n".join(buf)
                    chunks.append({
                        "chunk_index": idx,
                        "section": section_name,
                        "text": chunk_str,
                        "token_count": buf_tokens,
                    })
                    idx += 1
                    buf = [line]
                    buf_tokens = line_tokens
                else:
                    buf.append(line)
                    buf_tokens += line_tokens
            if buf:
                chunk_str = "\n".join(buf)
                chunks.append({
                    "chunk_index": idx,
                    "section": section_name,
                    "text": chunk_str,
                    "token_count": buf_tokens,
                })
                idx += 1

    return chunks
