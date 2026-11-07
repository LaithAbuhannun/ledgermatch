package com.laith.ledgermatch;

import static com.laith.ledgermatch.ReviewContracts.*;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ReviewService {
  private final ReviewRepository reviews;
  private final ReviewEventRepository events;
  private final BatchService batches;

  public ReviewService(
      ReviewRepository reviews, ReviewEventRepository events, BatchService batches) {
    this.reviews = reviews;
    this.events = events;
    this.batches = batches;
  }

  @Transactional(readOnly = true)
  public List<ReviewView> list(UUID batchId) {
    batches.get(batchId);
    return reviews.findByBatchId(batchId).stream().map(this::view).toList();
  }

  @Transactional
  public ReviewView update(UUID batchId, String reference, Update input) {
    var finding =
        batches.get(batchId).findings().stream()
            .filter(f -> f.reference().equals(reference))
            .findFirst()
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reference not found"));
    if (finding.status() == Contracts.Status.MATCHED)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Matched payments do not need exception reviews");
    var existing = reviews.findByBatchIdAndReference(batchId, reference);
    var review = existing.orElseGet(() -> new ExceptionReview(batchId, reference));
    if (review.version != input.version())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "This review changed. Reload it before saving.");
    if (input.status() == ReviewStatus.RESOLVED && input.reason() == Reason.INVESTIGATING)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Choose a resolution reason before resolving");
    review.status = input.status().name();
    review.owner = input.owner().trim();
    review.updatedAt = java.time.Instant.now();
    reviews.saveAndFlush(review);
    // Source amounts and matching results are never changed by a review decision.
    events.saveAndFlush(new ReviewEvent(review, input));
    return view(review);
  }

  private ReviewView view(ExceptionReview r) {
    return new ReviewView(
        r.reference,
        r.status,
        r.owner,
        r.version,
        r.updatedAt,
        events.findByReviewIdOrderByCreatedAtAscIdAsc(r.id).stream()
            .map(ReviewEvent::view)
            .toList());
  }
}
