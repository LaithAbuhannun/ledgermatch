package com.laith.ledgermatch;

import static com.laith.ledgermatch.Contracts.*;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BatchService {
  private final BatchRepository repo;
  private final ObjectMapper json;
  private final ReconciliationEngine engine;
  private final TransactionTemplate transaction;
  private final MeterRegistry metrics;

  public BatchService(
      BatchRepository repo,
      ObjectMapper json,
      ReconciliationEngine engine,
      TransactionTemplate transaction,
      MeterRegistry metrics) {
    this.repo = repo;
    this.json = json;
    this.engine = engine;
    this.transaction = transaction;
    this.metrics = metrics;
  }

  public record Result(Report report, boolean created) {}

  public Result submit(String key, Submission submission) {
    String payload = encode(submission);
    String fingerprint = hash(payload);
    Optional<ReconciliationBatch> existing = repo.findByRequestKey(key);
    if (existing.isPresent()) return replay(existing.get(), fingerprint);
    ReconciliationBatch batch =
        new ReconciliationBatch(UUID.randomUUID(), key, fingerprint, submission, payload);
    try {
      batch.reportSnapshot =
          json.writeValueAsString(engine.reconcile(batch.id, batch.createdAt, submission));
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Report snapshot failed", ex);
    }
    try {
      // Separate transaction lets a racing unique-key failure roll back before replay is read.
      transaction.executeWithoutResult(s -> repo.saveAndFlush(batch));
    } catch (DataIntegrityViolationException ex) {
      return repo.findByRequestKey(key).map(b -> replay(b, fingerprint)).orElseThrow(() -> ex);
    }
    Report report = report(batch);
    metrics.counter("ledgermatch.batches.created").increment();
    metrics.counter("ledgermatch.references.exceptions").increment(report.exceptions());
    return new Result(report, true);
  }

  private Result replay(ReconciliationBatch batch, String fingerprint) {
    if (!batch.fingerprint.equals(fingerprint))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Idempotency key already used with a different payload");
    return new Result(report(batch), false);
  }

  public Report get(UUID id) {
    return report(
        repo.findById(id)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
  }

  public PageView list(int page, int size) {
    var result =
        repo.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
    return new PageView(
        result.map(ReconciliationBatch::view).getContent(),
        page,
        size,
        result.getTotalElements(),
        result.getTotalPages());
  }

  private Report report(ReconciliationBatch batch) {
    try {
      if (batch.reportSnapshot != null) return json.readValue(batch.reportSnapshot, Report.class);
      return engine.reconcile(
          batch.id, batch.createdAt, json.readValue(batch.payload, Submission.class));
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Stored batch could not be decoded", ex);
    }
  }

  private String encode(Submission input) {
    try {
      return json.writeValueAsString(input);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Submission encoding failed", ex);
    }
  }

  private String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
  }
}
