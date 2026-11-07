package com.laith.ledgermatch;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "exception_review",
    uniqueConstraints = @UniqueConstraint(columnNames = {"batch_id", "reference"}))
public class ExceptionReview {
  @Id UUID id;

  @Column(name = "batch_id", nullable = false)
  UUID batchId;

  @Column(nullable = false, length = 80)
  String reference;

  @Column(name = "review_status", nullable = false, length = 20)
  String status;

  @Column(name = "owner_name", nullable = false, length = 100)
  String owner;

  @Column(name = "updated_at", nullable = false)
  Instant updatedAt;

  @Version long version;

  protected ExceptionReview() {}

  ExceptionReview(UUID batchId, String reference) {
    this.id = UUID.randomUUID();
    this.batchId = batchId;
    this.reference = reference;
    status = "OPEN";
    owner = "";
    updatedAt = Instant.now();
  }
}
