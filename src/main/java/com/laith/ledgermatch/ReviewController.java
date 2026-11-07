package com.laith.ledgermatch;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/batches/{batchId}/reviews")
public class ReviewController {
  private final ReviewService service;

  public ReviewController(ReviewService service) {
    this.service = service;
  }

  @GetMapping
  public List<ReviewContracts.ReviewView> list(@PathVariable UUID batchId) {
    return service.list(batchId);
  }

  @PutMapping("/{reference}")
  public ReviewContracts.ReviewView update(
      @PathVariable UUID batchId,
      @PathVariable String reference,
      @RequestBody @Valid ReviewContracts.Update input) {
    return service.update(batchId, reference, input);
  }
}
