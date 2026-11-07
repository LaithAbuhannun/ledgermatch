package com.laith.ledgermatch;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"ledgermatch.api-key=test-only-key"})
@AutoConfigureMockMvc
class ReviewWorkflowTest {
  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add(
        "spring.datasource.url",
        () ->
            System.getenv()
                .getOrDefault("TEST_DATABASE_URL", "jdbc:h2:mem:reviews;DB_CLOSE_DELAY=-1"));
    r.add(
        "spring.datasource.username",
        () -> System.getenv().getOrDefault("TEST_DATABASE_USER", "sa"));
    r.add(
        "spring.datasource.password",
        () -> System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", ""));
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired BatchRepository batches;

  private UUID batch(boolean matched) throws Exception {
    String body =
        """
{"accountLabel":"Operations account","settlementDate":"2026-11-07","ledger":[{"reference":"PAY-A","amount":100.00,"currency":"AUD"}],"bank":[{"reference":"PAY-A","amount":99.00,"currency":"AUD"}]}
""";
    if (matched) body = body.replace("99.00", "100.00");
    var result =
        mvc.perform(
                post("/api/batches")
                    .header("X-API-Key", "test-only-key")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
            .andExpect(status().isCreated())
            .andReturn();
    return UUID.fromString(
        json.readTree(result.getResponse().getContentAsString()).get("batchId").asText());
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder update(
      UUID id, long version, String status, String reason, String note) {
    var payload =
        Map.of(
            "version",
            version,
            "status",
            status,
            "actor",
            "Reviewer",
            "owner",
            "Cash ops",
            "reason",
            reason,
            "note",
            note);
    try {
      return put("/api/batches/" + id + "/reviews/PAY-A")
          .header("X-API-Key", "test-only-key")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(payload));
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @Test
  void savesAssignmentResolutionAndReopeningWithHistory() throws Exception {
    var id = batch(false);
    mvc.perform(update(id, 0, "IN_PROGRESS", "INVESTIGATING", "Checking the settlement export"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.owner").value("Cash ops"))
        .andExpect(jsonPath("$.history.length()").value(1));
    mvc.perform(update(id, 0, "RESOLVED", "FEE_CONFIRMED", "Confirmed one dollar processing fee"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(1))
        .andExpect(jsonPath("$.history.length()").value(2));
    mvc.perform(update(id, 1, "OPEN", "OTHER", "Reopened for supporting documentation"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.history.length()").value(3));
    mvc.perform(get("/api/batches/" + id + "/reviews").header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].status").value("OPEN"));
    mvc.perform(get("/api/batches/" + id).header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.findings[0].status").value("AMOUNT_MISMATCH"));
  }

  @Test
  void staleReviewVersionCannotOverwriteNewerDecision() throws Exception {
    var id = batch(false);
    mvc.perform(update(id, 0, "IN_PROGRESS", "INVESTIGATING", "First check"))
        .andExpect(status().isOk());
    mvc.perform(update(id, 0, "RESOLVED", "FEE_CONFIRMED", "Fee confirmed"))
        .andExpect(status().isOk());
    mvc.perform(update(id, 0, "OPEN", "OTHER", "Stale overwrite")).andExpect(status().isConflict());
    mvc.perform(get("/api/batches/" + id + "/reviews").header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].status").value("RESOLVED"))
        .andExpect(jsonPath("$[0].history.length()").value(2));
  }

  @Test
  void requiresNoteAndResolutionReason() throws Exception {
    var id = batch(false);
    mvc.perform(update(id, 0, "RESOLVED", "INVESTIGATING", "Still checking"))
        .andExpect(status().isBadRequest());
    mvc.perform(update(id, 0, "RESOLVED", "OTHER", " ")).andExpect(status().isBadRequest());
  }

  @Test
  void matchedRecordsCannotBeResolvedAsExceptions() throws Exception {
    mvc.perform(update(batch(true), 0, "RESOLVED", "OTHER", "No issue"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void protectsReviewDataAndHandlesUnknownBatch() throws Exception {
    mvc.perform(get("/api/batches/" + batch(false) + "/reviews"))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            get("/api/batches/" + UUID.randomUUID() + "/reviews")
                .header("X-API-Key", "test-only-key"))
        .andExpect(status().isNotFound());
  }

  @Test
  void storesReportSnapshotInsteadOfRecomputingFromMutablePayload() throws Exception {
    var id = batch(false);
    var row = batches.findById(id).orElseThrow();
    assertThat(row.reportSnapshot).isNotBlank();
    row.payload = "{}";
    batches.saveAndFlush(row);
    mvc.perform(get("/api/batches/" + id).header("X-API-Key", "test-only-key"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.counts.AMOUNT_MISMATCH").value(1));
  }
}
