"""Tests for the ingest-docs store module."""
from __future__ import annotations

from unittest.mock import MagicMock

from ingest_docs.store import SourceStore


def test_store_requires_dsn() -> None:
    """SourceStore raises ValueError when no DSN is provided."""
    import os

    old = os.environ.pop("DATABASE_URL", None)
    try:
        try:
            _ = SourceStore()  # type: ignore[call-arg]
        except ValueError:
            return  # Expected
        raise AssertionError("Expected ValueError")
    finally:
        if old is not None:
            os.environ["DATABASE_URL"] = old


def test_store_save_source_mocked() -> None:
    """SourceStore.save_source executes INSERT and returns id (mocked DB)."""
    store = SourceStore(dsn="postgresql://fake:fake@localhost/fake")
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = ("00000000-0000-0000-0000-000000000001",)
    conn.execute.return_value = cursor

    source_id = store.save_source(
        conn,
        workspace_id="ws-123",
        kind="pdf",
        title="Test Doc",
        ref={"chunks": []},
    )

    assert source_id == "00000000-0000-0000-0000-000000000001"
    conn.execute.assert_called_once()
    conn.commit.assert_called_once()
