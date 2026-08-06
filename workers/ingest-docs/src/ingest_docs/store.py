"""Source store — insert ingested documents into the Postgres ``source`` table."""
from __future__ import annotations

import json
import os
from typing import Any


class SourceStore:
    """Thin wrapper around psycopg3 for the ``source`` table."""

    def __init__(self, dsn: str | None = None) -> None:
        if dsn is None:
            dsn = os.environ.get("DATABASE_URL", "")
        if not dsn:
            raise ValueError(
                "DATABASE_URL must be set (or pass dsn explicitly) "
                "to persist sources to the database."
            )
        self._dsn = dsn

    def _connect(self) -> Any:
        import psycopg

        return psycopg.connect(self._dsn)

    def save_source(
        self,
        conn: Any,
        *,
        workspace_id: str,
        kind: str,
        title: str,
        ref: dict[str, Any],
        ai_run_id: str | None = None,
        agent_session_id: str | None = None,
    ) -> str:
        """Insert a row into ``source`` and return the new ``id`` (UUID string)."""
        cur = conn.execute(
            """
            INSERT INTO source (
                workspace_id, kind, title, ref,
                ai_run_id, agent_session_id
            ) VALUES (
                %(workspace_id)s, %(kind)s, %(title)s, %(ref)s,
                %(ai_run_id)s, %(agent_session_id)s
            )
            RETURNING id::text
            """,
            {
                "workspace_id": workspace_id,
                "kind": kind,
                "title": title,
                "ref": json.dumps(ref),
                "ai_run_id": ai_run_id,
                "agent_session_id": agent_session_id,
            },
        )
        row = cur.fetchone()
        conn.commit()
        assert row is not None
        return str(row[0])
