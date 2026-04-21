"""Shared image upload hardening helpers.

Used by sponsors.py and wheel.py upload endpoints to enforce:
- 2 MB max size
- extension allowlist (png/jpg/jpeg/webp/svg)
- magic-byte sniffing (reject .html renamed to .png)
"""
from fastapi import HTTPException, status

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "svg"}


def sniff_image_ext(content: bytes) -> str | None:
    """Return the canonical extension for a byte blob, or None if unknown."""
    if len(content) >= 8 and content[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(content) >= 3 and content[:3] == b"\xff\xd8\xff":
        return "jpg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    head = content[:256].lstrip().lower()
    if head.startswith(b"<?xml") or head.startswith(b"<svg"):
        return "svg"
    return None


def validate_image_upload(content: bytes) -> str:
    """Validate an uploaded image's size and content, return the sniffed extension.

    Raises HTTPException with 400 / 413 / 415 on failure.
    """
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large (max 2 MB)",
        )
    sniffed = sniff_image_ext(content)
    if sniffed is None or sniffed not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PNG / JPG / WEBP / SVG images are accepted",
        )
    return sniffed
