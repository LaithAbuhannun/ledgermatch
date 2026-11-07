# API contract

## Submission

```json
{
  "accountLabel": "Demo settlement account",
  "settlementDate": "2026-11-07",
  "ledger": [{"reference": "PAY-001", "amount": 100.00, "currency": "AUD"}],
  "bank": [{"reference": "PAY-001", "amount": 100.00, "currency": "AUD"}]
}
```

Account label: nonblank, at most 100 characters. Date: ISO local date, required. Each source: non-null list, up to 5,000 non-null entries. Empty sources are allowed so a missing file can be represented. Reference: 1–80 letters, digits, dots, hyphens or underscores. Amount: non-zero signed value, at most 13 integer and 2 fractional digits. Currency: recognised uppercase ISO 4217 code. Unknown fields are rejected rather than silently ignored.

## Outcome precedence

A reference receives exactly one status, in this order:

1. `DUPLICATE_REFERENCE`: more than one row on either side; do not guess which row is correct.
2. `MISSING_IN_LEDGER` or `MISSING_IN_BANK`: no row on that side.
3. `CURRENCY_MISMATCH`: compare currency before amount, with no implicit FX conversion.
4. `AMOUNT_MISMATCH`: compare exact decimal values.
5. `MATCHED`: same reference, currency and amount.

Reports list references in sorted order and preserve all source rows for each reference. `references` counts distinct references, not rows. `exceptions` counts references with any non-matched status. Currency mismatches may also have unequal amounts; only the higher-priority status is shown.

## Responses

- `201`: newly stored submission and report, with Location header.
- `200`: retrieval, history, or exact idempotent replay.
- `400`: invalid JSON, invalid fields, missing headers, invalid UUID or pagination.
- `401`: missing/incorrect API key.
- `404`: batch does not exist.
- `409`: same idempotency key with a different submission.

Error bodies use Problem Details. Validation bodies include an `errors` array of field paths and validation messages, without echoing full payment inputs. Batch UUIDs are identifiers, not access credentials.

## Exception reviews

`GET /api/batches/{uuid}/reviews` lists review decisions and their activity history. Unreviewed exceptions have implicit Open status and no owner.

`PUT /api/batches/{uuid}/reviews/{reference}` accepts:

```json
{"version":0,"status":"IN_PROGRESS","actor":"Alex","owner":"Cash operations","reason":"INVESTIGATING","note":"Checking the settlement cut-off."}
```

Statuses: OPEN, IN_PROGRESS, RESOLVED. A RESOLVED decision cannot use the INVESTIGATING reason. Each update requires a name and nonblank note. Reasons include TIMING_DIFFERENCE, FEE_CONFIRMED, SOURCE_CORRECTED, DUPLICATE_CONFIRMED and OTHER. These are reviewer assertions; the tool does not verify them against the bank.

Use version 0 for the first update, then the version returned by the server. A stale version or concurrent creation conflict returns 409. Review state and event history are committed atomically. Updates to matched references are rejected. Source payments and original findings are not modified.
