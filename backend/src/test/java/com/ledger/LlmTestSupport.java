package com.ledger;

import com.ledger.entity.Account;
import com.ledger.entity.ApiToken;
import com.ledger.entity.Budget;
import com.ledger.entity.Category;
import com.ledger.entity.Transaction;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.smallrye.jwt.build.Jwt;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Set;

/** Seed helpers shared by the LLM/API-token test classes. All writes run in their own tx. */
final class LlmTestSupport {

  private static final SecureRandom RANDOM = new SecureRandom();

  private LlmTestSupport() {}

  static Long createUser(String email) {
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              User user = new User();
              user.email = email;
              user.passwordHash = BcryptUtil.bcryptHash("password12345");
              user.displayName = "Test User";
              user.persist();
              return user.id;
            });
  }

  static String jwt(String email) {
    return Jwt.issuer("https://ledger.app/issuer")
        .upn(email)
        .groups(Set.of("user"))
        .expiresIn(Duration.ofHours(1))
        .sign();
  }

  /** Persists a token row directly and returns the plaintext (only the hash is stored). */
  static String createApiToken(Long userId, Instant expiresAt) {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    String plaintext = "led_" + HexFormat.of().formatHex(bytes);
    QuarkusTransaction.requiringNew()
        .run(
            () -> {
              ApiToken token = new ApiToken();
              token.user = User.findById(userId);
              token.name = "test";
              token.tokenHash = ApiToken.sha256Hex(plaintext);
              token.scope = ApiToken.SCOPE_READ;
              token.expiresAt = expiresAt;
              token.persist();
            });
    return plaintext;
  }

  static String createApiToken(Long userId) {
    return createApiToken(userId, Instant.now().plus(365, ChronoUnit.DAYS));
  }

  static Long findTokenId(String plaintext) {
    return QuarkusTransaction.requiringNew()
        .call(() -> ApiToken.findByTokenHash(ApiToken.sha256Hex(plaintext)).id);
  }

  static Long createAccount(Long userId, String name, AccountKind kind, String openingBalance) {
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              Account account = new Account();
              account.user = User.findById(userId);
              account.name = name;
              account.kind = kind;
              account.balance = new BigDecimal(openingBalance);
              account.openingBalance = new BigDecimal(openingBalance);
              account.persist();
              return account.id;
            });
  }

  static Long createCategory(Long userId, String name) {
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              Category category = new Category();
              category.user = User.findById(userId);
              category.name = name;
              category.persist();
              return category.id;
            });
  }

  static Long createBudget(Long userId, Long categoryId, String limitAmount) {
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              Budget budget = new Budget();
              budget.user = User.findById(userId);
              budget.category = Category.findById(categoryId);
              budget.limitAmount = new BigDecimal(limitAmount);
              budget.persist();
              return budget.id;
            });
  }

  static Long createTransaction(
      Long accountId, Long categoryId, String description, String amount, LocalDate occurredOn) {
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              Transaction t = new Transaction();
              t.account = Account.findById(accountId);
              t.category = categoryId == null ? null : Category.findById(categoryId);
              t.description = description;
              t.amount = new BigDecimal(amount);
              t.occurredOn = occurredOn;
              t.persist();
              return t.id;
            });
  }

  static void markLinkedBudget(Long transactionId, Long budgetId) {
    QuarkusTransaction.requiringNew()
        .run(
            () -> {
              Transaction t = Transaction.findById(transactionId);
              t.linkedBudget = Budget.findById(budgetId);
            });
  }

  static void markLinkedCard(Long transactionId, Long cardAccountId) {
    QuarkusTransaction.requiringNew()
        .run(
            () -> {
              Transaction t = Transaction.findById(transactionId);
              t.linkedCard = Account.findById(cardAccountId);
            });
  }

  static void setDueDay(Long accountId, int dueDayOfMonth) {
    QuarkusTransaction.requiringNew()
        .run(
            () -> {
              Account account = Account.findById(accountId);
              account.dueDayOfMonth = dueDayOfMonth;
            });
  }
}
