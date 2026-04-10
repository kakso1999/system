# GroundRewards External API Documentation

## Reward Code Verification API

Base URL: `http://your-server:3005/api/external`

These endpoints are **public** (no authentication required), designed for partner websites to verify and redeem reward codes issued by the GroundRewards system.

---

## 1. Check Reward Code

Verify whether a reward code exists and check its current status.

### Request

```
GET /api/external/reward-code/{code}/check
```

| Parameter | Type   | Location | Description |
|-----------|--------|----------|-------------|
| `code`    | string | path     | The reward code to check (case-insensitive) |

### Response — Code exists

```json
{
  "exists": true,
  "status": "assigned",
  "campaign_id": "69d5ca90efaa90e2336e59a7",
  "phone": "+639171234567",
  "created_at": "2026-04-10T08:30:00+00:00"
}
```

### Response — Code not found

```json
{
  "exists": false
}
```

### Status values

| Status     | Description |
|------------|-------------|
| `assigned` | Code is valid and ready to be redeemed |
| `redeemed` | Code has already been redeemed |
| `unused`   | Code exists in pool but not yet assigned to a user |
| `blocked`  | Code has been manually blocked by admin |

### Example

```bash
curl https://your-server:3005/api/external/reward-code/RC5A8KM2X7/check
```

---

## 2. Redeem Reward Code

Mark a reward code as redeemed. This is a one-time operation — once redeemed, it cannot be redeemed again.

**Only codes with status `assigned` can be redeemed.**

### Request

```
POST /api/external/reward-code/{code}/redeem
```

| Parameter | Type   | Location | Description |
|-----------|--------|----------|-------------|
| `code`    | string | path     | The reward code to redeem (case-insensitive) |

No request body required.

### Response — Success

```json
{
  "success": true,
  "message": "Reward code redeemed successfully"
}
```

### Response — Failure cases

**Code not found:**
```json
{
  "success": false,
  "message": "Reward code not found"
}
```

**Already redeemed:**
```json
{
  "success": false,
  "message": "Reward code already redeemed"
}
```

**Wrong status (e.g. blocked or unused):**
```json
{
  "success": false,
  "message": "Reward code status is 'blocked', cannot redeem"
}
```

### Example

```bash
curl -X POST https://your-server:3005/api/external/reward-code/RC5A8KM2X7/redeem
```

---

## Recommended Integration Flow

```
1. User wins a prize on GroundRewards → receives reward code (e.g. RC5A8KM2X7)
2. User visits your website and enters the reward code
3. Your website calls:  GET /api/external/reward-code/RC5A8KM2X7/check
4. If exists=true AND status="assigned" → show the prize claim form
5. User completes your claim process
6. Your website calls: POST /api/external/reward-code/RC5A8KM2X7/redeem
7. If success=true → prize delivered, done
```

---

## Code Format

- Reward codes are auto-generated as `RC` + 8 random alphanumeric characters (uppercase)
- Example: `RC5A8KM2X7`, `RCGT92HN4P`
- Codes are case-insensitive when checking/redeeming

## Rate Limits

- No rate limiting on these endpoints currently
- Recommend implementing rate limiting on your side if exposed to end users

## Error Handling

- HTTP 200 is returned for all responses (success and failure)
- Check the `exists` field (for check) or `success` field (for redeem) to determine the result
- No HTTP error codes (4xx/5xx) are used for business logic failures
