package com.laith.ledgermatch;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {
  private final byte[] key;

  public ApiKeyFilter(@Value("${ledgermatch.api-key}") String key) {
    if (key.isBlank()) throw new IllegalArgumentException("LEDGERMATCH_API_KEY must be set");
    this.key = key.getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    String path = req.getRequestURI().substring(req.getContextPath().length());
    boolean publicRead =
        req.getMethod().equals("GET")
            && java.util.Set.of(
                    "/",
                    "/index.html",
                    "/app.css",
                    "/app.js",
                    "/csv.mjs",
                    "/demo.json",
                    "/demo/report",
                    "/sample-ledger.csv",
                    "/sample-bank.csv",
                    "/actuator/health")
                .contains(path);
    boolean protectedPath = !publicRead;
    String supplied = req.getHeader("X-API-Key");
    if (protectedPath
        && (supplied == null
            || !MessageDigest.isEqual(key, supplied.getBytes(StandardCharsets.UTF_8)))) {
      res.setStatus(401);
      res.setContentType("application/problem+json");
      res.getWriter()
          .write(
              """
              {"title":"Unauthorized","status":401,"detail":"A valid X-API-Key is required"}
              """);
      return;
    }
    chain.doFilter(req, res);
  }
}
