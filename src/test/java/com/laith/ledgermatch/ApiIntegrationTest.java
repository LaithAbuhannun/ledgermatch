package com.laith.ledgermatch;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"ledgermatch.api-key=test-only-key"})
@AutoConfigureMockMvc
class ApiIntegrationTest {
  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add(
        "spring.datasource.url",
        () ->
            System.getenv()
                .getOrDefault("TEST_DATABASE_URL", "jdbc:h2:mem:tests;DB_CLOSE_DELAY=-1"));
    r.add(
        "spring.datasource.username",
        () -> System.getenv().getOrDefault("TEST_DATABASE_USER", "sa"));
    r.add(
        "spring.datasource.password",
        () -> System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", ""));
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired BatchRepository repo;
  private static final String BODY =
      """
{"accountLabel":"Demo account","settlementDate":"2026-11-07","ledger":[{"reference":"A","amount":10.00,"currency":"AUD"}],"bank":[{"reference":"A","amount":10.00,"currency":"AUD"}]}
""";

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder submission(
      String key, String body) {
    return post("/api/batches")
        .header("X-API-Key", "test-only-key")
        .header("Idempotency-Key", key)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  @Test
  void createsPersistsAndReplaysBatch() throws Exception {
    String key = UUID.randomUUID().toString();
    var response =
        mvc.perform(submission(key, BODY))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.exceptions").value(0))
            .andReturn();
    String id = json.readTree(response.getResponse().getContentAsString()).get("batchId").asText();
    assertThat(repo.findById(UUID.fromString(id))).isPresent();
    mvc.perform(submission(key, BODY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.batchId").value(id));
    mvc.perform(get("/api/batches/" + id).header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.counts.MATCHED").value(1));
  }

  @Test
  void reusedKeyWithDifferentPayloadIsConflict() throws Exception {
    String key = UUID.randomUUID().toString();
    mvc.perform(submission(key, BODY)).andExpect(status().isCreated());
    mvc.perform(submission(key, BODY.replace("Demo account", "Different account")))
        .andExpect(status().isConflict());
  }

  @Test
  void validatesNestedMoneyAndCurrency() throws Exception {
    mvc.perform(submission("bad-amount", BODY.replace("10.00", "0.00")))
        .andExpect(status().isBadRequest());
    mvc.perform(submission("bad-precision", BODY.replace("10.00", "10.001")))
        .andExpect(status().isBadRequest());
    mvc.perform(submission("bad-currency", BODY.replace("AUD", "ZZZ")))
        .andExpect(status().isBadRequest());
    mvc.perform(
            submission(
                "null-entry",
                BODY.replace(
                    "[{\"reference\":\"A\",\"amount\":10.00,\"currency\":\"AUD\"}]", "[null]")))
        .andExpect(status().isBadRequest());
  }

  @Test
  void supportsDebitTransactions() throws Exception {
    mvc.perform(submission("debit-" + UUID.randomUUID(), BODY.replace("10.00", "-10.00")))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.counts.MATCHED").value(1));
  }

  @Test
  void rejectsUnknownPropertiesAndBadKeys() throws Exception {
    mvc.perform(
            submission("unknown", BODY.replace("Demo account\"", "Demo account\",\"extra\":true")))
        .andExpect(status().isBadRequest());
    mvc.perform(submission("bad key", BODY)).andExpect(status().isBadRequest());
  }

  @Test
  void protectsDataAndMetricsButAllowsHealth() throws Exception {
    mvc.perform(get("/api/batches")).andExpect(status().isUnauthorized());
    mvc.perform(get("/actuator/prometheus")).andExpect(status().isUnauthorized());
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
  }

  @Test
  void validatesPaginationAndMissingBatch() throws Exception {
    mvc.perform(get("/api/batches?page=-1").header("X-API-Key", "test-only-key"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/batches?size=101").header("X-API-Key", "test-only-key"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/batches/" + UUID.randomUUID()).header("X-API-Key", "test-only-key"))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/batches?size=2").header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items").isArray());
  }

  @Test
  void publicExampleIsReadOnlyAndNeedsNoWorkspaceKey() throws Exception {
    long before = repo.count();
    mvc.perform(get("/demo/report"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.references").value(6))
        .andExpect(jsonPath("$.exceptions").value(5));
    assertThat(repo.count()).isEqualTo(before);
    mvc.perform(get("/sample-ledger.csv")).andExpect(status().isOk());
    mvc.perform(get("/csv.mjs")).andExpect(status().isOk());
  }

  @Test
  void concurrentRetriesCreateOneBatch() throws Exception {
    String key = UUID.randomUUID().toString();
    var executor = Executors.newFixedThreadPool(4);
    try {
      var futures = new ArrayList<Future<Integer>>();
      for (int i = 0; i < 4; i++)
        futures.add(
            executor.submit(
                () -> mvc.perform(submission(key, BODY)).andReturn().getResponse().getStatus()));
      var codes = new ArrayList<Integer>();
      for (var f : futures) codes.add(f.get(20, TimeUnit.SECONDS));
      assertThat(codes).containsOnly(200, 201);
      assertThat(Collections.frequency(codes, 201)).isEqualTo(1);
    } finally {
      executor.shutdownNow();
    }
  }
}
