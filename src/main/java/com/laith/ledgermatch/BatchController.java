package com.laith.ledgermatch;

import static com.laith.ledgermatch.Contracts.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/batches")
@Validated
public class BatchController {
  private final BatchService service;

  public BatchController(BatchService service) {
    this.service = service;
  }

  @PostMapping
  public ResponseEntity<Report> submit(
      @RequestHeader("Idempotency-Key") @Pattern(regexp = "[A-Za-z0-9_.-]{1,100}") String key,
      @RequestBody @Valid Submission input) {
    var result = service.submit(key, input);
    return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .location(URI.create("/api/batches/" + result.report().batchId()))
        .body(result.report());
  }

  @GetMapping("/{id}")
  public Report get(@PathVariable UUID id) {
    return service.get(id);
  }

  @GetMapping
  public PageView list(
      @RequestParam(defaultValue = "0") @Min(0) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
    return service.list(page, size);
  }
}
