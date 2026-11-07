package com.laith.ledgermatch;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class ReviewContracts {
  private ReviewContracts() {}

  public enum ReviewStatus {
    OPEN,
    IN_PROGRESS,
    RESOLVED
  }

  public enum Reason {
    INVESTIGATING,
    TIMING_DIFFERENCE,
    FEE_CONFIRMED,
    SOURCE_CORRECTED,
    DUPLICATE_CONFIRMED,
    OTHER
  }

  public record Update(
      @NotNull @Min(0) Long version,
      @NotNull ReviewStatus status,
      @NotBlank @Size(max = 100) String actor,
      @NotNull @Size(max = 100) String owner,
      @NotNull Reason reason,
      @NotBlank @Size(max = 2000) String note) {}

  public record EventView(
      UUID id,
      String actor,
      String status,
      String owner,
      String reason,
      String note,
      Instant createdAt) {}

  public record ReviewView(
      String reference,
      String status,
      String owner,
      long version,
      Instant updatedAt,
      List<EventView> history) {}
}
