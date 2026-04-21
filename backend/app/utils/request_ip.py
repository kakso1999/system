"""Extract the real client IP from a FastAPI Request.

Priority:
1. If the immediate peer is in TRUSTED_PROXY_IPS, walk X-Forwarded-For
   from the right-most entry leftward and return the first value that is
   NOT itself a trusted proxy and NOT a private/loopback IP.
   If every XFF entry is trusted/private, fall back to the left-most XFF
   entry (clients may be on private networks in legit topologies).
2. If the immediate peer is trusted and X-Real-IP is set, use that.
3. Otherwise return request.client.host.
"""
from __future__ import annotations

import ipaddress

from fastapi import Request

from app.config import get_settings


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_unspecified
    )


def _trusted_proxies() -> frozenset[str]:
    raw = (get_settings().TRUSTED_PROXY_IPS or "").strip()
    return frozenset(part.strip() for part in raw.split(",") if part.strip())


def _parse_xff(header_value: str) -> list[str]:
    return [part.strip() for part in header_value.split(",") if part.strip()]


def extract_client_ip(request: Request) -> str:
    peer = request.client.host if request.client else ""
    trusted = _trusted_proxies()

    if not peer or peer not in trusted:
        return peer

    xff = request.headers.get("X-Forwarded-For") or request.headers.get(
        "x-forwarded-for"
    )
    if xff:
        hops = _parse_xff(xff)
        for candidate in reversed(hops):
            if candidate in trusted:
                continue
            if _is_private(candidate):
                continue
            return candidate
        if hops:
            return hops[0]

    real_ip = request.headers.get("X-Real-IP") or request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    return peer
