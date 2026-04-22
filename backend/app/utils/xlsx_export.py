from __future__ import annotations

from collections.abc import AsyncIterable, Iterable, Sequence
from io import BytesIO

from fastapi.responses import StreamingResponse
from openpyxl import Workbook


def _build_xlsx_response(buffer: BytesIO, filename: str) -> StreamingResponse:
    content = buffer.getvalue()
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def _append_rows(
    worksheet,
    rows_iter: Iterable[Sequence[object]] | AsyncIterable[Sequence[object]],
) -> None:
    if isinstance(rows_iter, AsyncIterable):
        async for row in rows_iter:
            worksheet.append(list(row))
        return
    for row in rows_iter:
        worksheet.append(list(row))


async def xlsx_stream(
    rows_iter: Iterable[Sequence[object]] | AsyncIterable[Sequence[object]],
    headers: list[str],
    filename: str,
    sheet_name: str = "Sheet1",
) -> StreamingResponse:
    workbook = Workbook(write_only=True)
    worksheet = workbook.create_sheet(title=sheet_name)
    worksheet.append(list(headers))
    await _append_rows(worksheet, rows_iter)
    buffer = BytesIO()
    workbook.save(buffer)
    workbook.close()
    return _build_xlsx_response(buffer, filename)
