from bson import ObjectId


def to_str_id(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    # Convert any remaining ObjectId values to string
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
    return doc


def to_str_ids(docs: list[dict]) -> list[dict]:
    return [to_str_id(doc) for doc in docs]
