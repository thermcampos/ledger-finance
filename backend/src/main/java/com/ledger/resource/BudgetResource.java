package com.ledger.resource;

import com.ledger.entity.Budget;
import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.entity.Account;
import com.ledger.entity.Category;
import com.ledger.entity.Transaction;
import com.ledger.security.CurrentUserService;
import com.ledger.service.BudgetProjectionSyncService;
import com.ledger.entity.User;
import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Path("/budgets")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class BudgetResource {

  @Inject CurrentUserService currentUser;

  @Inject EntityManager em;

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
   * Budget row — so it always reflects the live ledger. Only negative (expense) transactions are
   * summed; positive amounts (income, transfers in) are excluded from "spent".
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
   * System-generated budget projection rows (linkedBudget set) are excluded — they represent
   * what is still available, not what was spent, so counting them would make the projection
   * collapse its own input. syncAll runs first for lazy month rollover, same as list().
   */
  @GET
  @Path("/month/{yearMonth}/spend")
  @Transactional
  public List<CategorySpendResponse> spendForMonth(@PathParam("yearMonth") String yearMonth) {
    User user = currentUser.require();
    budgetSync.syncAll(user);
    LocalDate start = LocalDate.parse(yearMonth + "-01");
    LocalDate end = start.plusMonths(1).minusDays(1);
    LocalDate today = LocalDate.now();
    if (end.isAfter(today)) {
      end = today;
    }

    return em.createQuery(
            "SELECT new com.ledger.dto.response.CategorySpendResponse(t.category.id, t.category.name, SUM(t.amount)) "
                + "FROM Transaction t "
                + "WHERE t.account.user.id = :userId "
                + "AND t.category IS NOT NULL "
                + "AND t.amount < 0 "
                + "AND t.linkedBudget IS NULL "
                + "AND t.occurredOn BETWEEN :start AND :end "
                + "GROUP BY t.category.id, t.category.name",
            CategorySpendResponse.class)
        .setParameter("userId", user.id)
        .setParameter("start", start)
        .setParameter("end", end)
        .getResultList();
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
