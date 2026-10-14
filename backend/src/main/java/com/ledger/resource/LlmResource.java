package com.ledger.resource;

import com.ledger.entity.Account;
import com.ledger.entity.Budget;
import com.ledger.entity.Category;
import com.ledger.entity.Transaction;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import com.ledger.security.ApiTokenIdentityProvider;
import com.ledger.service.BudgetProjectionSyncService;
import com.ledger.service.CreditCardBillSyncService;
import io.quarkus.panache.common.Sort;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Read-only, LLM-facing API (ChatGPT GPT Actions). Token-authenticated ({@code token-read} role —
 * browser JWTs are rejected), responses are pre-aggregated so the model narrates rather than
 * computes. System-generated projection rows (card bills and budget projections) are excluded
 * everywhere; card bill totals come from the bill side instead. Expense amounts are reported as
 * positive magnitudes.
 */
@Path("/llm")
@RolesAllowed("token-read")
@Produces(MediaType.APPLICATION_JSON)
public class LlmResource {

  private static final int MAX_TRANSACTION_ROWS = 200;

  @Inject SecurityIdentity identity;

  @Inject EntityManager em;

  @Inject BudgetProjectionSyncService budgetSync;

  @Inject CreditCardBillSyncService billSync;

  @GET
  @Path("/summary")
  @Transactional
  public SummaryResponse summary(@QueryParam("month") String month) {
    User user = requireUser();
    budgetSync.syncAll(user);
    YearMonth ym = parseMonth(month);
    LocalDate start = ym.atDay(1);
    LocalDate end = min(ym.atEndOfMonth(), LocalDate.now());

    BigDecimal income = sumAmount(user.id, start, end, true);
    BigDecimal expenses = sumAmount(user.id, start, end, false);

    List<AccountEntry> accounts =
        Account.findByUser(user.id).stream().map(AccountEntry::new).toList();

    List<CardBillEntry> cardBills = new ArrayList<>();
    for (Account account : Account.findByUser(user.id)) {
      if (account.kind != AccountKind.CREDIT_CARD) {
        continue;
      }
      billSync
          .unpaidBillTotals(account)
          .forEach(
              (dueOn, total) ->
                  cardBills.add(new CardBillEntry(account.name, total.negate(), dueOn)));
    }

    return new SummaryResponse(
        ym.toString(), accounts, income, expenses, income.subtract(expenses), cardBills);
  }

  @GET
  @Path("/transactions")
  public TransactionsResponse transactions(
      @QueryParam("from") String from,
      @QueryParam("to") String to,
      @QueryParam("accountId") Long accountId,
      @QueryParam("categoryId") Long categoryId,
      @QueryParam("q") String q,
      @QueryParam("limit") Integer limit) {
    User user = requireUser();
    LocalDate[] range = parseRange(from, to);
    int max = limit == null ? 50 : limit;
    if (max < 1) {
      throw new WebApplicationException("limit must be at least 1", 400);
    }
    max = Math.min(max, MAX_TRANSACTION_ROWS);

    StringBuilder query =
        new StringBuilder(
            "account.user.id = :userId and linkedCard is null and linkedBudget is null "
                + "and occurredOn between :from and :to");
    Map<String, Object> params = new HashMap<>();
    params.put("userId", user.id);
    params.put("from", range[0]);
    params.put("to", range[1]);
    if (accountId != null) {
      query.append(" and account.id = :accountId");
      params.put("accountId", accountId);
    }
    if (categoryId != null) {
      query.append(" and category.id = :categoryId");
      params.put("categoryId", categoryId);
    }
    if (q != null && !q.isBlank()) {
      query.append(" and lower(description) like :q");
      params.put("q", "%" + q.toLowerCase() + "%");
    }

    List<Transaction> rows =
        Transaction.find(query.toString(), Sort.descending("occurredOn").and("id"), params)
            .page(io.quarkus.panache.common.Page.ofSize(max + 1))
            .list();
    boolean truncated = rows.size() > max;
    if (truncated) {
      rows = rows.subList(0, max);
    }
    return new TransactionsResponse(
        rows.stream().map(TransactionEntry::new).toList(), truncated);
  }

  /**
   * Budgets with live spend for the month. Status words mirror the frontend thresholds: spent
   * &ge; limit → "Over budget", &ge; 85% → "Near limit", otherwise "On track".
   */
  @GET
  @Path("/budgets")
  @Transactional
  public List<BudgetEntry> budgets(@QueryParam("month") String month) {
    User user = requireUser();
    budgetSync.syncAll(user);
    YearMonth ym = parseMonth(month);
    LocalDate start = ym.atDay(1);
    LocalDate end = min(ym.atEndOfMonth(), LocalDate.now());

    Map<Long, BigDecimal> spendByCategory = new HashMap<>();
    for (Object[] row : categorySpendRows(user.id, start, end)) {
      spendByCategory.put((Long) row[0], ((BigDecimal) row[2]).negate());
    }

    List<Budget> budgets = Budget.list("user.id = ?1", user.id);
    List<BudgetEntry> result = new ArrayList<>();
    for (Budget budget : budgets) {
      BigDecimal spent = spendByCategory.getOrDefault(budget.category.id, BigDecimal.ZERO);
      BigDecimal remaining = budget.limitAmount.subtract(spent);
      result.add(
          new BudgetEntry(
              budget.category.id,
              budget.category.name,
              budget.limitAmount,
              spent,
              remaining,
              statusWord(spent, budget.limitAmount)));
    }
    return result;
  }

  @GET
  @Path("/cashflow/by-month")
  public List<CashflowMonth> cashflow(@QueryParam("months") Integer months) {
    User user = requireUser();
    int n = months == null ? 3 : months;
    if (n < 1 || n > 24) {
      throw new WebApplicationException("months must be between 1 and 24", 400);
    }
    YearMonth startYm = YearMonth.now().minusMonths(n - 1);

    Map<String, BigDecimal> income = monthlySums(user.id, startYm.atDay(1), true);
    Map<String, BigDecimal> expenses = monthlySums(user.id, startYm.atDay(1), false);

    List<CashflowMonth> result = new ArrayList<>();
    for (int i = 0; i < n; i++) {
      String key = startYm.plusMonths(i).toString();
      BigDecimal in = income.getOrDefault(key, BigDecimal.ZERO);
      BigDecimal out = expenses.getOrDefault(key, BigDecimal.ZERO);
      result.add(new CashflowMonth(key, in, out, in.subtract(out)));
    }
    return result;
  }

  @GET
  @Path("/spending/by-category")
  public List<CategoryTotal> spendingByCategory(
      @QueryParam("from") String from, @QueryParam("to") String to) {
    User user = requireUser();
    LocalDate[] range = parseRange(from, to);
    List<CategoryTotal> result = new ArrayList<>();
    for (Object[] row : categorySpendRows(user.id, range[0], range[1])) {
      result.add(new CategoryTotal((Long) row[0], (String) row[1], ((BigDecimal) row[2]).negate()));
    }
    return result;
  }

  @GET
  @Path("/accounts")
  public List<AccountEntry> accounts() {
    User user = requireUser();
    return Account.findByUser(user.id).stream().map(AccountEntry::new).toList();
  }

  @GET
  @Path("/categories")
  public List<CategoryEntry> categories() {
    User user = requireUser();
    return Category.findVisibleByUser(user.id).stream().map(CategoryEntry::new).toList();
  }

  private User requireUser() {
    Long userId = identity.getAttribute(ApiTokenIdentityProvider.ATTR_USER_ID);
    User user = userId == null ? null : User.findById(userId);
    if (user == null) {
      throw new NotAuthorizedException("No user associated with this token");
    }
    return user;
  }

  private BigDecimal sumAmount(Long userId, LocalDate start, LocalDate end, boolean income) {
    BigDecimal sum =
        em.createQuery(
                "SELECT SUM(t.amount) FROM Transaction t "
                    + "WHERE t.account.user.id = :userId "
                    + "AND t.linkedCard IS NULL AND t.linkedBudget IS NULL "
                    + "AND t.amount "
                    + (income ? "> 0" : "< 0")
                    + " AND t.occurredOn BETWEEN :start AND :end",
                BigDecimal.class)
            .setParameter("userId", userId)
            .setParameter("start", start)
            .setParameter("end", end)
            .getSingleResult();
    if (sum == null) {
      return BigDecimal.ZERO;
    }
    return income ? sum : sum.negate();
  }

  /**
   * Expense totals per category (amounts negative in the ledger, newest-capped range handled by
   * the caller). Row shape: [categoryId, categoryName, SUM(amount)].
   */
  @SuppressWarnings("unchecked")
  private List<Object[]> categorySpendRows(Long userId, LocalDate start, LocalDate end) {
    return em.createQuery(
            "SELECT t.category.id, t.category.name, SUM(t.amount) FROM Transaction t "
                + "WHERE t.account.user.id = :userId "
                + "AND t.category IS NOT NULL AND t.amount < 0 "
                + "AND t.linkedCard IS NULL AND t.linkedBudget IS NULL "
                + "AND t.occurredOn BETWEEN :start AND :end "
                + "GROUP BY t.category.id, t.category.name "
                + "ORDER BY SUM(t.amount) ASC")
        .setParameter("userId", userId)
        .setParameter("start", start)
        .setParameter("end", end)
        .getResultList();
  }

  /** Per-month income/expense sums keyed "yyyy-MM", from {@code start} onward. */
  private Map<String, BigDecimal> monthlySums(Long userId, LocalDate start, boolean income) {
    @SuppressWarnings("unchecked")
    List<Object[]> rows =
        em.createQuery(
                "SELECT year(t.occurredOn), month(t.occurredOn), SUM(t.amount) FROM Transaction t "
                    + "WHERE t.account.user.id = :userId "
                    + "AND t.linkedCard IS NULL AND t.linkedBudget IS NULL "
                    + "AND t.amount "
                    + (income ? "> 0" : "< 0")
                    + " AND t.occurredOn >= :start "
                    + "GROUP BY year(t.occurredOn), month(t.occurredOn)")
            .setParameter("userId", userId)
            .setParameter("start", start)
            .getResultList();
    Map<String, BigDecimal> result = new TreeMap<>();
    for (Object[] row : rows) {
      String key = String.format("%04d-%02d", (Integer) row[0], (Integer) row[1]);
      BigDecimal sum = (BigDecimal) row[2];
      result.put(key, income ? sum : sum.negate());
    }
    return result;
  }

  private static String statusWord(BigDecimal spent, BigDecimal limit) {
    if (spent.compareTo(limit) >= 0) {
      return "Over budget";
    }
    if (spent.compareTo(limit.multiply(new BigDecimal("0.85"))) >= 0) {
      return "Near limit";
    }
    return "On track";
  }

  private static LocalDate min(LocalDate a, LocalDate b) {
    return a.isAfter(b) ? b : a;
  }

  private static YearMonth parseMonth(String month) {
    if (month == null || month.isBlank()) {
      return YearMonth.now();
    }
    try {
      return YearMonth.parse(month);
    } catch (Exception e) {
      throw new WebApplicationException("month must be in yyyy-MM format", 400);
    }
  }

  /** Defaults to the current month to date; both bounds inclusive. */
  private static LocalDate[] parseRange(String from, String to) {
    LocalDate today = LocalDate.now();
    LocalDate fromDate =
        from == null || from.isBlank() ? today.withDayOfMonth(1) : parseDate(from, "from");
    LocalDate toDate = to == null || to.isBlank() ? today : parseDate(to, "to");
    if (toDate.isBefore(fromDate)) {
      throw new WebApplicationException("'to' must not be before 'from'", 400);
    }
    return new LocalDate[] {fromDate, toDate};
  }

  private static LocalDate parseDate(String value, String param) {
    try {
      return LocalDate.parse(value);
    } catch (Exception e) {
      throw new WebApplicationException(param + " must be in yyyy-MM-dd format", 400);
    }
  }

  public static class SummaryResponse {
    public String month;
    public List<AccountEntry> accounts;
    public BigDecimal income;
    public BigDecimal expenses;
    public BigDecimal net;
    public List<CardBillEntry> cardBills;

    public SummaryResponse(
        String month,
        List<AccountEntry> accounts,
        BigDecimal income,
        BigDecimal expenses,
        BigDecimal net,
        List<CardBillEntry> cardBills) {
      this.month = month;
      this.accounts = accounts;
      this.income = income;
      this.expenses = expenses;
      this.net = net;
      this.cardBills = cardBills;
    }
  }

  public static class AccountEntry {
    public Long id;
    public String name;
    public String institution;
    public AccountKind kind;
    public BigDecimal balance;

    public AccountEntry(Account account) {
      this.id = account.id;
      this.name = account.name;
      this.institution = account.institution;
      this.kind = account.kind;
      this.balance = account.balance;
    }
  }

  public static class CardBillEntry {
    public String card;
    public BigDecimal total;
    public LocalDate dueOn;

    public CardBillEntry(String card, BigDecimal total, LocalDate dueOn) {
      this.card = card;
      this.total = total;
      this.dueOn = dueOn;
    }
  }

  public static class TransactionsResponse {
    public List<TransactionEntry> transactions;
    public boolean truncated;

    public TransactionsResponse(List<TransactionEntry> transactions, boolean truncated) {
      this.transactions = transactions;
      this.truncated = truncated;
    }
  }

  public static class TransactionEntry {
    public Long id;
    public LocalDate date;
    public String description;
    public BigDecimal amount;
    public AccountRef account;
    public CategoryRef category;

    public TransactionEntry(Transaction t) {
      this.id = t.id;
      this.date = t.occurredOn;
      this.description = t.description;
      this.amount = t.amount;
      this.account = new AccountRef(t.account.id, t.account.name);
      this.category = t.category == null ? null : new CategoryRef(t.category.id, t.category.name);
    }
  }

  public static class AccountRef {
    public Long id;
    public String name;

    public AccountRef(Long id, String name) {
      this.id = id;
      this.name = name;
    }
  }

  public static class CategoryRef {
    public Long id;
    public String name;

    public CategoryRef(Long id, String name) {
      this.id = id;
      this.name = name;
    }
  }

  public static class BudgetEntry {
    public Long categoryId;
    public String category;
    public BigDecimal limit;
    public BigDecimal spent;
    public BigDecimal remaining;
    public String status;

    public BudgetEntry(
        Long categoryId,
        String category,
        BigDecimal limit,
        BigDecimal spent,
        BigDecimal remaining,
        String status) {
      this.categoryId = categoryId;
      this.category = category;
      this.limit = limit;
      this.spent = spent;
      this.remaining = remaining;
      this.status = status;
    }
  }

  public static class CashflowMonth {
    public String month;
    public BigDecimal income;
    public BigDecimal expenses;
    public BigDecimal net;

    public CashflowMonth(String month, BigDecimal income, BigDecimal expenses, BigDecimal net) {
      this.month = month;
      this.income = income;
      this.expenses = expenses;
      this.net = net;
    }
  }

  public static class CategoryTotal {
    public Long categoryId;
    public String category;
    public BigDecimal total;

    public CategoryTotal(Long categoryId, String category, BigDecimal total) {
      this.categoryId = categoryId;
      this.category = category;
      this.total = total;
    }
  }

  public static class CategoryEntry {
    public Long id;
    public String name;

    public CategoryEntry(Category category) {
      this.id = category.id;
      this.name = category.name;
    }
  }
}
