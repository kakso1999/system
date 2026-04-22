import csv
import io
from collections.abc import AsyncIterable, Iterable, Sequence

from fastapi.responses import StreamingResponse


def _reset_buffer(buffer: io.StringIO) -> str:
    value = buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    return value


def _sync_csv_rows(
    writer: csv.writer,
    buffer: io.StringIO,
    headers: list[str],
    rows_iter: Iterable[Sequence[object]],
):
    writer.writerow(headers)
    yield _reset_buffer(buffer)
    for row in rows_iter:
        writer.writerow(row)
        yield _reset_buffer(buffer)


async def _async_csv_rows(
    writer: csv.writer,
    buffer: io.StringIO,
    headers: list[str],
    rows_iter: AsyncIterable[Sequence[object]],
):
    writer.writerow(headers)
    yield _reset_buffer(buffer)
    async for row in rows_iter:
        writer.writerow(row)
        yield _reset_buffer(buffer)


def csv_stream(
    rows_iter: Iterable[Sequence[object]] | AsyncIterable[Sequence[object]],
    headers: list[str],
    filename: str,
) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    content = (
        _async_csv_rows(writer, buffer, headers, rows_iter)
        if isinstance(rows_iter, AsyncIterable)
        else _sync_csv_rows(writer, buffer, headers, rows_iter)
    )

    return StreamingResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
