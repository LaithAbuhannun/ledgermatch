package com.laith.ledgermatch;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewRepository extends JpaRepository<ExceptionReview, UUID> {
  Optional<ExceptionReview> findByBatchIdAndReference(UUID batchId, String reference);

  List<ExceptionReview> findByBatchId(UUID batchId);
}
