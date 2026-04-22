import csv
import io
from collections.abc import Iterable, Sequence

from fastapi.responses import StreamingResponse


def csv_stream(
    rows_iter: Iterable[Sequence[object]],
    headers: list[str],
    filename: str,
) -> StreamingResponse:
    def gen():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for row in rows_iter:
            writer.writerow(row)
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
