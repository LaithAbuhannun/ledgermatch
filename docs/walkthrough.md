# Understand and demonstrate LedgerMatch

## Five-minute demo

1. Follow the local setup in the README. Open the dashboard and load the synthetic sample.
2. Reconcile it and explain why there are six references but eleven input rows. The duplicate belongs to a single reference, not two separate findings.
3. Show each exception. Currency mismatch is checked before amount mismatch so different currencies are not treated as directly comparable amounts.
4. Submit again. The UI keeps the same idempotency key for unchanged content, and the server returns the same stored batch.
5. Change a number and submit to create a new batch. Use the API example to demonstrate that changing the payload while explicitly reusing an existing key produces 409.
6. Run `./mvnw verify` and inspect the concurrency test and the decimal-scale test.

## Read the code in this order

- `Contracts.java`: input validation and output records.
- `ReconciliationEngine.java`: matching rules, grouping, status priority and decimal comparisons. No Spring web/database calls here.
- `BatchController.java`: HTTP contract, pagination and status codes.
- `BatchService.java`: serialisation, fingerprints, persistence and race handling.
- `ApiKeyFilter.java`: the deliberately simple demo access boundary.
- Tests: see what behaviour is actually demonstrated, including limitations.

## Questions to be ready for

**Why not doubles?** Decimal money comparison must not introduce binary floating-point discrepancies. BigDecimal.compareTo ignores scale for equal values.

**What if two retries arrive together?** An initial lookup is insufficient. The database uniqueness constraint chooses a winner, and the losing transaction rolls back before reading and replaying that winner.

**Why not microservices?** One workflow and one data owner do not justify distributed deployment. Components are separated within a modular monolith instead.

**Why store JSON in a relational database?** Batches are immutable documents read together. The database supplies uniqueness and persistence. Normalised transaction tables would become useful for searchable historical investigations.

**Is it production ready?** No. It is a working personal project with local and CI tests. It does not have tenant authorisation, real bank integrations, immutable/versioned audit reports, production load tests or an operational availability track record.

**How was it built?** With AI coding assistance. Be specific about the code you have reviewed, changes you have made and behaviour you can explain. Do not present unfamiliar code or tool-generated design decisions as commercial experience.

## A useful next change to implement yourself

Add a bank-only duplicate test, or a filter to show a single exception type. Explain the behaviour first, write a failing test, implement the change and run the suite. For a deeper change, persist versioned report snapshots so future matching-rule changes cannot alter historical reports.
