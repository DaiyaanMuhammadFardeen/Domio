# ingest-docs — Document Ingestion for AI Copilot

Extract, chunk, and store source documents (PDF, DOCX, Notion, Markdown) for the Domio AI Copilot.

## Quick Start

```bash
cd workers/ingest-docs
pip install -e ".[dev]"
python -m ingest_docs --help
```

## CLI Usage

```bash
# PDF
python -m ingest_docs report.pdf --kind pdf --title "Q4 Report" --workspace-id <uuid>

# DOCX
python -m ingest_docs slide-deck.docx --kind docx --title "Deck" --workspace-id <uuid>

# Markdown
python -m ingest_docs notes.md --kind markdown --title "Notes" --workspace-id <uuid>

# Notion export (JSON)
python -m ingest_docs export.json --kind notion --title "My Page" --workspace-id <uuid>

# With DB persistence (sets DATABASE_URL)
DATABASE_URL="postgresql://..." python -m ingest_docs doc.pdf --kind pdf --title "Doc" --workspace-id <uuid>
```

## Architecture

```
ingest_docs/
├── __init__.py       # Package
├── __main__.py       # CLI entry point
├── extractors.py     # PDF, DOCX, Notion, Markdown extractors
├── chunker.py        # Heading-based chunking with token limits
└── store.py          # Postgres source table persistence (psycopg3)
```

## Chunk Storage

Chunks are stored in `source.ref` JSONB under the key `chunks`:

```json
{
  "chunks": [
    {"chunk_index": 0, "section": "Intro", "text": "...", "token_count": 450}
  ]
}
```

No separate chunk table — all data lives in `source.ref` per migration 0039.

## Development

```bash
pip install -e ".[dev]"
pytest tests/          # Run tests
ruff check .           # Lint
mypy src/              # Type check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | Postgres connection string. If unset, CLI prints JSON only. |

## Optional Dependencies

| Extra | Purpose |
|-------|---------|
| `pdf` | PyMuPDF for PDF extraction |
| `docx` | python-docx for DOCX extraction |
| `ocr` | pytesseract for scanned PDF OCR |
