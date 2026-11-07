package com.laith.ledgermatch;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_event")
public class ReviewEvent {
  @Id UUID id;

  @Column(name = "review_id", nullable = false)
  UUID reviewId;

  @Column(name = "actor_name", nullable = false, length = 100)
  String actor;

  @Column(name = "event_status", nullable = false, length = 20)
  String status;

  @Column(name = "owner_name", nullable = false, length = 100)
  String owner;

  @Column(nullable = false, length = 40)
  String reason;

  @Column(nullable = false, length = 2000)
  String note;

  @Column(name = "created_at", nullable = false)
  Instant createdAt;

  protected ReviewEvent() {}

  ReviewEvent(ExceptionReview review, ReviewContracts.Update input) {
    id = UUID.randomUUID();
    reviewId = review.id;
    actor = input.actor().trim();
    status = review.status;
    owner = review.owner;
    reason = input.reason().name();
    note = input.note().trim();
    createdAt = Instant.now();
  }

  ReviewContracts.EventView view() {
    return new ReviewContracts.EventView(id, actor, status, owner, reason, note, createdAt);
  }
}
