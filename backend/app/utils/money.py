"""Money-cents conversion helpers.

Strategy:
- DB stores integer cents in `{field}_cents` (100 cents == 1 PHP).
- Legacy docs may still have `{field}` as float (PHP); migration populates cents.
- Services/routers ALWAYS operate on integer cents internally.
- Responses expose the legacy float key for API compatibility (cents / 100.0).
"""
from __future__ import annotations

from typing import Any


def to_cents(amount_php: float | int | None) -> int:
    """Convert a PHP amount (float or int) to integer cents. None -> 0."""
    if amount_php is None:
        return 0
    return int(round(float(amount_php) * 100))


def from_cents(cents: int | float | None) -> float:
    """Convert integer cents to a PHP float (cents / 100.0). None -> 0.0."""
    if cents is None:
        return 0.0
    return float(int(cents)) / 100.0


def read_cents(
    doc: dict[str, Any] | None,
    *,
    cents_key: str = "amount_cents",
    legacy_key: str = "amount",
) -> int:
    """Read integer cents from a mongo document, preferring the cents key.

    Falls back to legacy float PHP * 100 for docs not yet migrated. Always
    returns an `int`. None-safe.
    """
    if not doc:
        return 0
    cents_val = doc.get(cents_key)
    if cents_val is not None:
        try:
            return int(cents_val)
        except (TypeError, ValueError):
            pass
    legacy_val = doc.get(legacy_key)
    if legacy_val is None:
        return 0
    return to_cents(legacy_val)


def apply_rate_cents(base_cents: int, rate: float | int) -> int:
    """Multiply cents by a float rate, rounding to the nearest cent."""
    return int(round(int(base_cents) * float(rate)))
