package com.laith.ledgermatch;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewEventRepository extends JpaRepository<ReviewEvent, UUID> {
  List<ReviewEvent> findByReviewIdOrderByCreatedAtAscIdAsc(UUID reviewId);
}
