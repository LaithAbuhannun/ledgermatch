package com.laith.ledgermatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public read-only example. No user input and no database writes. */
@RestController
public class DemoController {
  private final ReconciliationEngine engine;
  private final ObjectMapper json;

  public DemoController(ReconciliationEngine engine, ObjectMapper json) {
    this.engine = engine;
    this.json = json;
  }

  @GetMapping("/demo/report")
  public Contracts.Report example() throws IOException {
    try (var input = new ClassPathResource("static/demo.json").getInputStream()) {
      return engine.reconcile(
          UUID.fromString("00000000-0000-0000-0000-000000000001"),
          Instant.parse("2026-11-07T00:00:00Z"),
          json.readValue(input, Contracts.Submission.class));
    }
  }
}
