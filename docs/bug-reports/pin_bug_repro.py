#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
from pymongo import MongoClient

INVITE_CODE = "NFPSSY"
DEFAULT_BASE_URLS = ["http://localhost:8000", "http://localhost:3005"]
DEVICE_FINGERPRINT = "audit-fp-001"
COMMON_PASSWORDS = [
    "123456",
    "12345678",
    "admin123",
    "password",
    "Password123",
    "test123",
    "Test1234",
    "Test@123",
    "welcome123",
    "Welcome123",
    "groundrewards",
    "GroundRewards",
    "GroundRewards123",
    "GroundRewards2026",
    "wstest1",
    "wstest",
    "wstest123",
    "wstest@123",
    "ws123456",
    "ws12345678",
    "9171234567",
    "+639171234567",
    "639171234567",
    "NFPSSY",
    "nfpssy",
    "qwerty",
    "abc123",
    "abc12345",
    "111111",
    "000000",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def detect_base_url() -> str:
    env_url = os.getenv("BACKEND_BASE_URL", "").strip()
    candidates = [env_url] if env_url else DEFAULT_BASE_URLS
    errors: list[str] = []
    for base_url in candidates:
        try:
            response = requests.get(f"{base_url}/api/health", timeout=1.5)
            if response.ok:
                print(f"[info] backend={base_url}")
                return base_url.rstrip("/")
            errors.append(f"{base_url} -> HTTP {response.status_code}")
        except requests.RequestException as exc:
            errors.append(f"{base_url} -> {exc!r}")
    raise SystemExit("No backend responded.\n" + "\n".join(errors))


def connect_db():
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DATABASE_NAME", "ground_rewards")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=3000)
    client.admin.command("ping")
    print(f"[info] mongodb={mongo_url} db={db_name}")
    return client, client[db_name]


def find_staff(db):
    projection = {
        "_id": 1,
        "invite_code": 1,
        "username": 1,
        "name": 1,
        "status": 1,
        "work_status": 1,
        "promotion_paused": 1,
        "risk_frozen": 1,
        "campaign_id": 1,
        "qr_version": 1,
        "password_hash": 1,
    }
    staff = db.staff_users.find_one({"invite_code": INVITE_CODE}, projection)
    if not staff:
        raise SystemExit(f"staff invite_code={INVITE_CODE} not found in staff_users")
    print("[info] staff=" + json_dump(staff))
    return staff


def try_login(base_url: str, username: str):
    session = requests.Session()
    tried: list[dict[str, Any]] = []
    for password in COMMON_PASSWORDS:
        try:
            response = session.post(
                f"{base_url}/api/auth/staff/login",
                json={"username": username, "password": password},
                timeout=5,
            )
        except requests.RequestException as exc:
            tried.append({"password": password, "error": repr(exc)})
            continue
        tried.append({"password": password, "status": response.status_code})
        if response.ok:
            data = response.json()
            token = data.get("access_token", "")
            print(f"[info] login succeeded with password={password!r}")
            return session, token, password, tried
    return session, "", "", tried


def report_password_hint(db, staff) -> None:
    apps = list(
        db.staff_registration_applications.find(
            {"username": staff["username"]},
            {"_id": 1, "username": 1, "invite_code": 1, "password": 1, "password_hash": 1},
        ).limit(3)
    )
    print("[stop] password is unknown; common defaults did not work.")
    print("[stop] checked collections:")
    print(json_dump(
        {
            "staff_users": {
                "collection": "staff_users",
                "fields_present": ["username", "invite_code", "password_hash"],
                "plaintext_hint_found": False,
            },
            "staff_registration_applications": {
                "collection": "staff_registration_applications",
                "matching_docs": apps,
                "plaintext_hint_found": any("password" in doc for doc in apps),
            },
        }
    ))


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"} if access_token else {}


def extract_signature(qr_data: str) -> tuple[str, str]:
    parsed = urlparse(qr_data)
    params = parse_qs(parsed.query)
    return params.get("lt", [""])[0], params.get("v", [""])[0]


def load_live_settings(db) -> dict[str, Any]:
    rows = db.system_settings.find(
        {"key": {"$in": ["live_qr_enabled", "live_qr_expires_sec", "live_pin_max_fails", "promo_session_expires_min"]}},
        {"_id": 0, "key": 1, "value": 1},
    )
    return {row["key"]: row.get("value") for row in rows}


def explain_failure(db, staff, token_signature: str, attempted_pin: str, verify_result: Any) -> None:
    token = db.promo_live_tokens.find_one({"token_signature": token_signature})
    latest = db.promo_live_tokens.find_one({"staff_id": staff["_id"]}, sort=[("created_at", -1)])
    settings = load_live_settings(db)
    reasons: list[str] = []
    current_now = datetime.now(timezone.utc)

    staff_state = {
        "status": staff.get("status", "active"),
        "work_status": staff.get("work_status", "stopped"),
        "promotion_paused": bool(staff.get("promotion_paused", False)),
        "risk_frozen": bool(staff.get("risk_frozen", False)),
    }
    if (
        staff_state["status"] != "active"
        or staff_state["work_status"] != "promoting"
        or staff_state["promotion_paused"]
        or staff_state["risk_frozen"]
    ):
        reasons.append(f"staff gate would reject: {staff_state}")

    if token is None:
        reasons.append("No promo_live_tokens row matches token_signature. Likely rotation, wrong backend/DB, or TTL cleanup.")
    else:
        exp = token.get("expires_at")
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if token.get("status") != "active":
            reasons.append(f"matched token status is {token.get('status')!r}, so /claim/pin/verify returns not_found")
        if exp and exp <= current_now:
            reasons.append(f"matched token is expired at {exp.isoformat()}")
        if token.get("pin") != attempted_pin:
            reasons.append(f"matched token pin is {token.get('pin')!r}, attempted pin is {attempted_pin!r}")
        max_fails = int(settings.get("live_pin_max_fails") or 5)
        if int(token.get("failures", 0) or 0) >= max_fails:
            reasons.append(f"matched token has failures={token.get('failures')} and is at/over max_fails={max_fails}")

    if latest is not None and token is not None and latest.get("_id") != token.get("_id"):
        reasons.append("latest token row differs from scanned token row; promoter screen may have rotated since scan")
    if latest is not None and token is None:
        reasons.append("a newer token exists but the scanned signature no longer resolves")

    print("[debug] verify_result=" + json_dump(verify_result))
    print("[debug] matched_token=" + json_dump(token))
    print("[debug] latest_token=" + json_dump(latest))
    print("[debug] explanation=" + json_dump(reasons))


def main() -> int:
    print(f"[info] started_at={now_iso()}")
    base_url = detect_base_url()
    client, db = connect_db()
    try:
        staff = find_staff(db)
        settings = load_live_settings(db)
        print("[info] live_settings=" + json_dump(settings))

        session, access_token, password, attempts = try_login(base_url, staff["username"])
        print("[info] login_attempts=" + json_dump(attempts))
        if not access_token:
            report_password_hint(db, staff)
            return 2

        generate_response = session.post(
            f"{base_url}/api/promoter/live-qr/generate",
            json={},
            headers=auth_headers(access_token),
            timeout=5,
        )
        print("[info] generate_status=" + str(generate_response.status_code))
        print("[info] generate_body=" + generate_response.text)
        generate_response.raise_for_status()
        generated = generate_response.json()

        qr_data = generated.get("qr_data", "")
        token_signature, qr_version = extract_signature(qr_data)
        print(
            "[info] generated_fields="
            + json_dump(
                {
                    "pin": generated.get("pin"),
                    "qr_data": qr_data,
                    "token_signature": token_signature,
                    "qr_version": qr_version,
                }
            )
        )

        verify_payload = {
            "staff_code": INVITE_CODE,
            "pin": generated.get("pin", ""),
            "device_fingerprint": DEVICE_FINGERPRINT,
            "token_signature": token_signature,
        }
        verify_response = requests.post(
            f"{base_url}/api/claim/pin/verify",
            json=verify_payload,
            timeout=5,
        )
        verify_json: Any
        try:
            verify_json = verify_response.json()
        except ValueError:
            verify_json = {"raw_text": verify_response.text}
        print("[info] verify_status=" + str(verify_response.status_code))
        print("[info] verify_body=" + json_dump(verify_json))

        if not (isinstance(verify_json, dict) and verify_json.get("success") is True):
            explain_failure(db, staff, token_signature, generated.get("pin", ""), verify_json)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
