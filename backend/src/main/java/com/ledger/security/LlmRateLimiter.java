package com.ledger.security;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * In-memory per-token fixed-window rate limit. Prod runs a single replica, so no shared store is
 * needed; worst case on restart is one fresh window per token.
 */
@ApplicationScoped
public class LlmRateLimiter {

  final int limitPerMinute;

  @Inject
  public LlmRateLimiter(
      @ConfigProperty(name = "ledger.llm.rate-limit-per-minute", defaultValue = "60")
          int limitPerMinute) {
    this.limitPerMinute = limitPerMinute;
  }

  private final Map<Long, Window> windows = new ConcurrentHashMap<>();

  public boolean tryAcquire(Long tokenId) {
    long currentMinute = Instant.now().getEpochSecond() / 60;
    Window window = windows.computeIfAbsent(tokenId, k -> new Window());
    synchronized (window) {
      if (window.minute != currentMinute) {
        window.minute = currentMinute;
        window.count = 0;
      }
      if (window.count >= limitPerMinute) {
        return false;
      }
      window.count++;
      return true;
    }
  }

  private static final class Window {
    long minute = -1;
    int count;
  }
}
