from bson import ObjectId


def _serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_value(item) for item in value]
    return value


def to_str_id(doc: dict | None) -> dict:
    if not doc:
        return {}
    data = _serialize_value(doc)
    if "_id" in data:
        data["id"] = str(data.pop("_id"))
    return data


def to_str_ids(docs: list[dict] | None) -> list[dict]:
    if not docs:
        return []
    return [to_str_id(doc) for doc in docs if doc is not None]
