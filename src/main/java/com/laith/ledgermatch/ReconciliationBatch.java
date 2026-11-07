package com.laith.ledgermatch;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "reconciliation_batch")
public class ReconciliationBatch {
  @Id UUID id;

  @Column(name = "request_key", nullable = false, unique = true, length = 100)
  String requestKey;

  @Column(nullable = false, length = 64)
  String fingerprint;

  @Column(name = "account_label", nullable = false, length = 100)
  String accountLabel;

  @Column(name = "settlement_date", nullable = false)
  LocalDate settlementDate;

  @Column(name = "created_at", nullable = false)
  Instant createdAt;

  @Column(nullable = false, columnDefinition = "TEXT")
  String payload;

  protected ReconciliationBatch() {}

  ReconciliationBatch(
      UUID id, String key, String fingerprint, Contracts.Submission s, String payload) {
    this.id = id;
    requestKey = key;
    this.fingerprint = fingerprint;
    accountLabel = s.accountLabel();
    settlementDate = s.settlementDate();
    createdAt = Instant.now();
    this.payload = payload;
  }

  Contracts.BatchView view() {
    return new Contracts.BatchView(id, accountLabel, settlementDate, createdAt);
  }
}
