package com.ledger.resource;

import com.ledger.entity.Budget;
import com.ledger.dto.response.BudgetSummaryResponse;
import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.entity.Account;
import com.ledger.entity.Category;
import com.ledger.entity.Transaction;
import com.ledger.security.CurrentUserService;
import com.ledger.service.BudgetProjectionSyncService;
import com.ledger.service.BudgetSpendService;
import com.ledger.entity.User;
import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@Path("/budgets")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class BudgetResource {

  @Inject CurrentUserService currentUser;

  @Inject BudgetSpendService spendService;

  @Inject BudgetProjectionSyncService budgetSync;

  /**
   * syncAll runs first so a month rollover (or a stale projection from any path that missed a
   * write hook) self-corrects on read — there is no scheduler in this project by design.
   */
  @GET
  @Transactional
  public List<Budget> list() {
    User user = currentUser.require();
    budgetSync.syncAll(user);
    return Budget.list("user.id = ?1", user.id);
  }

  /**
   * Per-category spend for the given month, derived from transactions rather than stored on the
   * Budget row — so it always reflects the live ledger. Amounts are summed signed: expenses
   * (negative) add to "spent", positive amounts (refunds) subtract from it.
   */
  @GET
  @Path("/month/{yearMonth}/category/{categoryId}/transactions")
  public List<Transaction> transactionsForCategory(
      @PathParam("yearMonth") String yearMonth, @PathParam("categoryId") Long categoryId) {
    User user = currentUser.require();
    LocalDate start = LocalDate.parse(yearMonth + "-01");
    LocalDate end = start.plusMonths(1).minusDays(1);
    return Transaction.list(
        "account.user.id = ?1 and category.id = ?2 and occurredOn between ?3 and ?4 "
            + "and linkedBudget is null",
        Sort.descending("occurredOn").and("id"),
        user.id,
        categoryId,
        start,
        end);
  }

  /**
   * Per-category spend for the month — exclusions documented on BudgetSpendService. Rows dated
   * after today are left out unless includeUpcoming is set (the Report page's toggle). syncAll
   * runs first for lazy month rollover, same as list().
   */
  @GET
  @Path("/month/{yearMonth}/spend")
  @Transactional
  public List<CategorySpendResponse> spendForMonth(
      @PathParam("yearMonth") String yearMonth,
      @QueryParam("includeUpcoming") @DefaultValue("false") boolean includeUpcoming) {
    User user = currentUser.require();
    budgetSync.syncAll(user);
    return spendService.spendForMonth(user, parseMonth(yearMonth), includeUpcoming);
  }

  /**
   * Every budget with the month's limit/spent/left/status/perDay and the month's days left —
   * what the Budgets page renders (and the daily digest reuses). Upcoming rows are excluded.
   */
  @GET
  @Path("/month/{yearMonth}/summary")
  public BudgetSummaryResponse summaryForMonth(@PathParam("yearMonth") String yearMonth) {
    User user = currentUser.require();
    return spendService.summaryForMonth(user, parseMonth(yearMonth));
  }

  private static YearMonth parseMonth(String yearMonth) {
    try {
      return YearMonth.parse(yearMonth);
    } catch (DateTimeParseException e) {
      throw new BadRequestException("Month must be yyyy-MM");
    }
  }

  @POST
  @Transactional
  public Budget upsert(@Valid UpsertBudgetRequest request) {
    User user = currentUser.require();
    Category category = Category.findById(request.categoryId);
    if (category == null || !category.user.id.equals(user.id)) {
      throw new NotFoundException("Category not found");
    }

    Account account = null;
    if (request.accountId != null) {
      account = Account.findById(request.accountId);
      if (account == null || !account.user.id.equals(user.id)) {
        throw new NotFoundException("Account not found");
      }
      if (!budgetSync.isProjectable(account.kind)) {
        throw new WebApplicationException(
            "Budget account must be a checking, savings or credit card account", 400);
      }
    }

    Budget budget =
        Budget.find("user.id = ?1 and category.id = ?2", user.id, request.categoryId)
            .firstResult();

    if (budget == null) {
      budget = new Budget();
      budget.user = user;
      budget.category = category;
    }
    budget.limitAmount = request.limitAmount;
    budget.account = account;
    budget.persist();
    budgetSync.sync(budget);
    return budget;
  }

  @DELETE
  @Path("/{id}")
  @Transactional
  public void delete(@PathParam("id") Long id) {
    User user = currentUser.require();
    Budget budget = Budget.findById(id);
    if (budget == null || !budget.user.id.equals(user.id)) {
      throw new NotFoundException();
    }
    budgetSync.clear(budget);
    budget.delete();
  }

  public static class UpsertBudgetRequest {
    @NotNull public Long categoryId;
    @NotNull public BigDecimal limitAmount;

    /** Optional projection target — when null, no transaction is projected. */
    public Long accountId;
  }
}
