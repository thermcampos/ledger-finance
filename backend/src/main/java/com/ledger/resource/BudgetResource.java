package com.ledger.resource;

import com.ledger.entity.Budget;
import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.entity.Category;
import com.ledger.security.CurrentUserService;
import com.ledger.entity.User;
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

  @GET
  @Path("/month/{yearMonth}")
  public List<Budget> listForMonth(@PathParam("yearMonth") String yearMonth) {
    User user = currentUser.require();
    LocalDate month = LocalDate.parse(yearMonth + "-01");
    return Budget.list("user.id = ?1 and month = ?2", user.id, month);
  }

  /**
   * Per-category spend for the given month, derived from transactions rather than stored on the
   * Budget row — so it always reflects the live ledger. Only negative (expense) transactions are
   * summed; positive amounts (income, transfers in) are excluded from "spent".
   */
  @GET
  @Path("/month/{yearMonth}/spend")
  public List<CategorySpendResponse> spendForMonth(@PathParam("yearMonth") String yearMonth) {
    User user = currentUser.require();
    LocalDate start = LocalDate.parse(yearMonth + "-01");
    LocalDate end = start.plusMonths(1).minusDays(1);
    LocalDate today = LocalDate.now();
    if (end.isAfter(today)) {
      end = today;
    }

    return em.createQuery(
            "SELECT new com.ledger.budget.CategorySpend(t.category.id, t.category.name, SUM(t.amount)) "
                + "FROM Transaction t "
                + "WHERE t.account.user.id = :userId "
                + "AND t.category IS NOT NULL "
                + "AND t.amount < 0 "
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

    Budget budget =
        Budget.find(
                "user.id = ?1 and category.id = ?2 and month = ?3",
                user.id,
                request.categoryId,
                request.month)
            .firstResult();

    if (budget == null) {
      budget = new Budget();
      budget.user = user;
      budget.category = category;
      budget.month = request.month;
    }
    budget.limitAmount = request.limitAmount;
    budget.persist();
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
    budget.delete();
  }

  public static class UpsertBudgetRequest {
    @NotNull public Long categoryId;
    @NotNull public LocalDate month;
    @NotNull public BigDecimal limitAmount;
  }
}
