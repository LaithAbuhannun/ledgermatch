package com.laith.ledgermatch;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BatchRepository extends JpaRepository<ReconciliationBatch, UUID> {
  Optional<ReconciliationBatch> findByRequestKey(String requestKey);
}
