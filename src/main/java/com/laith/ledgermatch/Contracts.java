package com.laith.ledgermatch;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class Contracts {
  private Contracts() {}

  public record Entry(
      @NotBlank @Size(max = 80) @Pattern(regexp = "[A-Za-z0-9_.-]+") String reference,
      @NotNull @Digits(integer = 13, fraction = 2) BigDecimal amount,
      @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency) {
    @com.fasterxml.jackson.annotation.JsonIgnore
    @AssertTrue(message = "amount must not be zero")
    public boolean isAmountNonZero() {
      return amount == null || amount.signum() != 0;
    }

    @com.fasterxml.jackson.annotation.JsonIgnore
    @AssertTrue(message = "currency must be a recognised ISO 4217 code")
    public boolean isCurrencyValid() {
      if (currency == null) return true;
      try {
        Currency.getInstance(currency);
        return true;
      } catch (IllegalArgumentException ex) {
        return false;
      }
    }
  }

  public record Submission(
      @NotBlank @Size(max = 100) String accountLabel,
      @NotNull LocalDate settlementDate,
      @NotNull @Size(max = 5000) List<@NotNull @Valid Entry> ledger,
      @NotNull @Size(max = 5000) List<@NotNull @Valid Entry> bank) {}

  public enum Status {
    MATCHED,
    MISSING_IN_BANK,
    MISSING_IN_LEDGER,
    AMOUNT_MISMATCH,
    CURRENCY_MISMATCH,
    DUPLICATE_REFERENCE
  }

  public record Finding(String reference, Status status, List<Entry> ledger, List<Entry> bank) {}

  public record Report(
      UUID batchId,
      String accountLabel,
      LocalDate settlementDate,
      Instant createdAt,
      int references,
      long exceptions,
      Map<Status, Long> counts,
      List<Finding> findings) {}

  public record BatchView(
      UUID id, String accountLabel, LocalDate settlementDate, Instant createdAt) {}

  public record PageView(
      List<BatchView> items, int page, int size, long totalElements, int totalPages) {}
}
