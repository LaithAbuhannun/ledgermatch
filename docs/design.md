# Design decisions

## Why reconciliation?

It is a concrete finance operations problem with testable correctness rules. It demonstrates Java, Spring Boot, REST, relational persistence, transactions, validation and software reliability without pretending to process real money.

## Why a modular monolith?

There is one workflow and one data owner. Separate microservices would add deployment, networking and consistency problems without a useful boundary. Controller, service, matching engine and repository are separate so the matching engine can be tested without Spring or a database.

## Why BigDecimal?

Binary floating-point arithmetic can introduce false mismatches. Decimal comparison ignores representational scale for matching, while validation prevents accepting fractions beyond this demo's two-decimal money model. No conversion between currencies is attempted.

## Why store a batch payload?

Both source sets are an immutable document, read together for matching. A single relational batch table supports uniqueness, atomic ingestion, history and persistence with a small schema. JSON is stored as portable TEXT rather than using PostgreSQL-only JSONB, so local H2 and PostgreSQL exercise the same migration. A future investigation/search workload could normalise transaction rows with indexes and query/report projections.

## What happens on retries?

A unique database constraint on the idempotency key is the authority. The service checks for existing content, but does not rely on the check to prevent races. A concurrent insert conflict is rolled back in its own transaction before loading the winner. The fingerprint is then compared: same request replays; different payload conflicts. API tests submit four concurrent identical requests and assert one creation.

## What would change for a real service?

Use user/tenant authorisation, encryption and secret management, append-only access auditing, versioned rule/report snapshots and retention policy. Add observed workload limits, asynchronous imports and operational error budgets after measuring needs. None of those are claimed to exist in this project.
