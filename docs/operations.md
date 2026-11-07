# Local operations and troubleshooting

## Start and verify

Set `LEDGERMATCH_API_KEY` then start via Maven or Docker Compose. Check `/actuator/health` for `UP`; this includes database health but hides details. Submit the sample and confirm 6 references, 1 matched and 5 exceptions. Replay with the same idempotency key and confirm HTTP 200 with the same batch UUID.

## Failed startup

- Missing API key: supply the environment variable. Do not commit real keys.
- Database unavailable: check URL, credentials, PostgreSQL service health and application logs.
- Flyway migration failure: inspect the migration/version mismatch. Do not disable validation or edit a migration already applied to a shared database.
- Address in use: set a different PORT or stop the process already listening.

## Reconciliation failures

- 400: inspect the validation field paths. Check decimal places, currency codes, reference format and required headers.
- 401: check X-API-Key; do not include the key in screenshots or issue reports.
- 409: the key already belongs to another payload. Retry unchanged content or issue a new key for a new submission.
- Unexpected exception count: inspect all preserved source rows. Duplicate references take priority over other discrepancies.

## Metrics

The protected Prometheus endpoint exposes standard JVM/HTTP metrics, `ledgermatch_batches_created_total` and `ledgermatch_references_exceptions_total`. To inspect locally:

```sh
curl -H "X-API-Key: $LEDGERMATCH_API_KEY" http://127.0.0.1:8080/actuator/prometheus
```

Counter values reset with the process; database history persists. High exception counts can indicate poor source data, not a service outage. No alerts or SLOs are configured in this installation.

## Data

The local H2 database lives under `data/`. Compose uses a named PostgreSQL volume. Stop the application before copying local data for a backup. Only import records you are authorised to handle in the configured workspace. Public or multi-tenant deployments need additional identity and security controls. Avoid logging transaction payloads or API keys.
