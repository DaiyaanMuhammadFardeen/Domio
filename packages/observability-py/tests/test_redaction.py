"""Tests for the inline PII redaction helpers."""

from __future__ import annotations

from domio_obs.internal.redaction import is_luhn_valid, redact_string, redact_value


def test_luhn_valid_visa() -> None:
    assert is_luhn_valid("4242424242424242")


def test_luhn_valid_mastercard() -> None:
    assert is_luhn_valid("5555555555554444")


def test_luhn_invalid_sequence() -> None:
    assert not is_luhn_valid("1234567890123456")
    assert not is_luhn_valid("1111111111111111")


def test_luhn_with_spaces() -> None:
    assert is_luhn_valid("4242 4242 4242 4242")


def test_email_redaction() -> None:
    assert "alice@example.com" not in redact_string("contact alice@example.com")
    assert "[REDACTED]" in redact_string("contact alice@example.com")


def test_phone_intl_redaction() -> None:
    out = redact_string("+8801712345678")
    assert "[REDACTED]" in out
    out = redact_string("+1 415 555 0123")
    assert "[REDACTED]" in out


def test_nid_redaction() -> None:
    for nid in ["1234567890", "1234567890123", "12345678901234567"]:
        assert "[REDACTED]" in redact_string(f"NID: {nid}")


def test_jwt_redaction() -> None:
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.abc123signature456"
    assert "eyJ" not in redact_string(f"bearer {jwt}")
    assert "[REDACTED]" in redact_string(f"bearer {jwt}")


def test_assigned_secret_redaction() -> None:
    out = redact_string("api_key=sk_live_abcdefghijklmnop")
    assert "[REDACTED]" in out
    assert "sk_live" not in out


def test_credit_card_redaction() -> None:
    assert "[REDACTED]" in redact_string("card: 4242-4242-4242-4242")


def test_credit_card_luhn_invalid_left_alone() -> None:
    out = redact_string("invoice 1234567890123456")
    assert "[REDACTED]" not in out


def test_empty_string_passes_through() -> None:
    assert redact_string("") == ""


def test_no_pii_unchanged() -> None:
    text = "GET /api/v1/decks 200 12ms"
    assert redact_string(text) == text


def test_redact_value_handles_nested() -> None:
    out = redact_value({"user_email": "a@b.com", "tenant_id": "org_1"})
    assert out["user_email"] == "[REDACTED]"
    assert out["tenant_id"] == "org_1"


def test_redact_value_handles_cycles() -> None:
    a: dict = {"name": "a@b.com"}
    a["self"] = a
    out = redact_value(a)
    assert out["name"] == "[REDACTED]"


def test_redact_value_passes_numbers() -> None:
    assert redact_value(42) == 42
    assert redact_value(False) is False
    assert redact_value(None) is None
