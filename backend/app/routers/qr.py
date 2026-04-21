import io

import qrcode
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

router = APIRouter()

_MAX_DATA_LEN = 512
_MIN_SIZE = 64
_MAX_SIZE = 1024
_ALLOWED_SIZES = range(_MIN_SIZE, _MAX_SIZE + 1)


@router.get("/qr")
async def generate_qr(
    data: str = Query(..., min_length=1, max_length=_MAX_DATA_LEN),
    size: int = Query(320, ge=_MIN_SIZE, le=_MAX_SIZE),
):
    if size not in _ALLOWED_SIZES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid size")
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    # Resize to requested size (nearest-neighbor preserves crisp QR modules)
    img = img.resize((size, size))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )
