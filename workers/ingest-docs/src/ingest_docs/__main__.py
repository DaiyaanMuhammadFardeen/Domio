"""CLI entry point for ingest-docs.

Usage:
    python -m ingest_docs <path> --kind pdf|docx|markdown|notion --title X \\
        --workspace-id UUID [--ai-run-id UUID]

Extracts text, chunks it, prints JSON to stdout, and optionally persists to
Postgres when ``DATABASE_URL`` is set.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ingest_docs.chunker import chunk_text
from ingest_docs.extractors import (
    ExtractedDocument,
    extract_docx,
    extract_markdown,
    extract_notion,
    extract_pdf,
)


def _load_extracted(path: Path, kind: str) -> ExtractedDocument:
    """Dispatch to the correct extractor."""
    if kind == "pdf":
        return extract_pdf(path)
    if kind == "docx":
        return extract_docx(path)
    if kind == "markdown":
        text = path.read_text(encoding="utf-8")
        return extract_markdown(text)
    if kind == "notion":
        raw = json.loads(path.read_text(encoding="utf-8"))
        blocks = raw if isinstance(raw, list) else raw.get("blocks", [])
        return extract_notion(blocks)
    raise ValueError(f"Unsupported kind: {kind}")


def main(argv: list[str] | None = None) -> int:
    """Main entry point. Returns exit code 0 on success, 1 on failure."""
    parser = argparse.ArgumentParser(
        prog="ingest-docs",
        description="Extract, chunk, and store source documents for the AI Copilot.",
    )
    parser.add_argument("path", help="Path to the document file")
    parser.add_argument(
        "--kind",
        required=True,
        choices=["pdf", "docx", "markdown", "notion"],
        help="Document kind",
    )
    parser.add_argument("--title", required=True, help="Document title")
    parser.add_argument(
        "--workspace-id", required=True, help="Workspace UUID (for DB storage)"
    )
    parser.add_argument("--ai-run-id", default=None, help="Optional AI run UUID")

    args = parser.parse_args(argv)
    doc_path = Path(args.path)

    if not doc_path.is_file():
        print(f"Error: file not found: {doc_path}", file=sys.stderr)
        return 1

    try:
        extracted = _load_extracted(doc_path, args.kind)
    except Exception as exc:  # noqa: BLE001
        print(f"Extraction failed: {exc}", file=sys.stderr)
        return 1

    # Chunk all paragraphs.
    all_chunks: list[dict[str, object]] = []
    offset = 0
    for para in extracted.paragraphs:
        chunks = chunk_text(para, start_index=offset)
        all_chunks.extend(chunks)
        offset += len(chunks)

    ref: dict[str, object] = {
        "title": extracted.title,
        "paragraph_count": len(extracted.paragraphs),
        "table_count": len(extracted.tables),
        "chunks": all_chunks,
    }
    result: dict[str, object] = {
        "kind": extracted.kind,
        "title": extracted.title,
        "workspace_id": args.workspace_id,
        "ref": ref,
        "chunk_count": len(all_chunks),
    }

    # Optionally persist to DB.
    import os

    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        from ingest_docs.store import SourceStore

        store = SourceStore(database_url)
        conn = store._connect()
        source_id = store.save_source(
            conn,
            workspace_id=args.workspace_id,
            kind=extracted.kind,
            title=extracted.title,
            ref=ref,
            ai_run_id=args.ai_run_id,
        )
        conn.close()
        result["source_id"] = source_id

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
