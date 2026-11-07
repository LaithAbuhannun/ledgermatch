package com.laith.ledgermatch;

import static com.laith.ledgermatch.Contracts.*;
import static org.assertj.core.api.Assertions.*;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReconciliationEngineTest {
  private final ReconciliationEngine engine = new ReconciliationEngine();

  private Entry e(String ref, String amount, String currency) {
    return new Entry(ref, new BigDecimal(amount), currency);
  }

  private Report run(List<Entry> l, List<Entry> b) {
    return engine.reconcile(
        UUID.randomUUID(),
        Instant.now(),
        new Submission("Test account", LocalDate.of(2026, 11, 7), l, b));
  }

  @Test
  void decimalScaleDoesNotCreateFalseMismatch() {
    assertThat(
            run(List.of(e("A", "10.0", "AUD")), List.of(e("A", "10.00", "AUD")))
                .findings()
                .get(0)
                .status())
        .isEqualTo(Status.MATCHED);
  }

  @Test
  void classifiesEveryExceptionAndSortsReferences() {
    var r =
        run(
            List.of(
                e("F", "10", "AUD"),
                e("B", "10", "AUD"),
                e("C", "10", "AUD"),
                e("D", "10", "AUD"),
                e("E", "10", "AUD"),
                e("E", "10", "AUD")),
            List.of(
                e("A", "10", "AUD"),
                e("B", "10", "AUD"),
                e("C", "11", "AUD"),
                e("D", "10", "USD"),
                e("E", "10", "AUD")));
    assertThat(r.findings())
        .extracting(Finding::status)
        .containsExactly(
            Status.MISSING_IN_LEDGER,
            Status.MATCHED,
            Status.AMOUNT_MISMATCH,
            Status.CURRENCY_MISMATCH,
            Status.DUPLICATE_REFERENCE,
            Status.MISSING_IN_BANK);
    assertThat(r.references()).isEqualTo(6);
    assertThat(r.exceptions()).isEqualTo(5);
  }

  @Test
  void duplicateInBankIsNotSilentlyMatched() {
    var r = run(List.of(e("A", "10", "AUD")), List.of(e("A", "10", "AUD"), e("A", "10", "AUD")));
    assertThat(r.findings().get(0).status()).isEqualTo(Status.DUPLICATE_REFERENCE);
    assertThat(r.findings().get(0).bank()).hasSize(2);
  }

  @Test
  void currencyMismatchTakesPriorityOverAmountMismatch() {
    assertThat(
            run(List.of(e("A", "10", "AUD")), List.of(e("A", "15", "USD")))
                .findings()
                .get(0)
                .status())
        .isEqualTo(Status.CURRENCY_MISMATCH);
  }

  @Test
  void emptyInputsProduceEmptyReport() {
    assertThat(run(List.of(), List.of()).references()).isZero();
  }
}
