package com.laith.ledgermatch;

import static com.laith.ledgermatch.Contracts.*;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Pure deterministic matching; no network calls or floating-point arithmetic. */
@Component
public class ReconciliationEngine {
  public Report reconcile(UUID id, Instant created, Submission input) {
    Map<String, List<Entry>> ledger = group(input.ledger());
    Map<String, List<Entry>> bank = group(input.bank());
    Set<String> refs = new TreeSet<>(ledger.keySet());
    refs.addAll(bank.keySet());
    List<Finding> findings = new ArrayList<>();
    Map<Status, Long> counts = new EnumMap<>(Status.class);
    for (Status s : Status.values()) counts.put(s, 0L);
    for (String ref : refs) {
      List<Entry> l = ledger.getOrDefault(ref, List.of());
      List<Entry> b = bank.getOrDefault(ref, List.of());
      Status status;
      if (l.size() > 1 || b.size() > 1) status = Status.DUPLICATE_REFERENCE;
      else if (l.isEmpty()) status = Status.MISSING_IN_LEDGER;
      else if (b.isEmpty()) status = Status.MISSING_IN_BANK;
      else if (!l.get(0).currency().equals(b.get(0).currency())) status = Status.CURRENCY_MISMATCH;
      else if (l.get(0).amount().compareTo(b.get(0).amount()) != 0) status = Status.AMOUNT_MISMATCH;
      else status = Status.MATCHED;
      counts.merge(status, 1L, Long::sum);
      findings.add(new Finding(ref, status, List.copyOf(l), List.copyOf(b)));
    }
    return new Report(
        id,
        input.accountLabel(),
        input.settlementDate(),
        created,
        refs.size(),
        refs.size() - counts.get(Status.MATCHED),
        Collections.unmodifiableMap(counts),
        List.copyOf(findings));
  }

  private Map<String, List<Entry>> group(List<Entry> entries) {
    return entries.stream().collect(Collectors.groupingBy(Entry::reference));
  }
}
