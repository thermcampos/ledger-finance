package com.ledger.resource;

import com.ledger.entity.Account;
import com.ledger.entity.CreditCardBill;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import com.ledger.security.CurrentUserService;
import io.quarkus.hibernate.orm.panache.Panache;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.LocalDate;

@Path("/credit-card-bills")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CreditCardBillResource {

  @Inject CurrentUserService currentUser;

  @GET
  public Response find(@QueryParam("accountId") Long accountId, @QueryParam("dueDate") String dueDate) {
    Account account = requireOwnedAccount(accountId);
    if (account.kind != AccountKind.CREDIT_CARD) {
      throw new WebApplicationException("Account is not a credit card", 400);
    }
    LocalDate date = parseDueDate(dueDate);
    CreditCardBill bill = CreditCardBill.findByAccountAndDueDate(account.id, date);
    if (bill == null) {
      return Response.noContent().build();
    }
    return Response.ok(bill).build();
  }

  @POST
  @Transactional
  public CreditCardBill consolidate(ConsolidateRequest request) {
    Account account = requireOwnedAccount(request.accountId);
    if (account.kind != AccountKind.CREDIT_CARD) {
      throw new WebApplicationException("Account is not a credit card", 400);
    }
    LocalDate date = parseDueDate(request.dueDate);

    CreditCardBill bill = CreditCardBill.findByAccountAndDueDate(account.id, date);
    if (bill == null) {
      bill = new CreditCardBill();
      bill.account = account;
      bill.dueDate = date;
      bill.consolidated = true;
      bill.persist();
    } else {
      bill.consolidated = true;
      bill.onUpdate();
    }
    Panache.flush();
    return bill;
  }

  private Account requireOwnedAccount(Long accountId) {
    User user = currentUser.require();
    if (accountId == null) {
      throw new WebApplicationException("accountId is required", 400);
    }
    Account account = Account.findById(accountId);
    if (account == null || !account.user.id.equals(user.id)) {
      throw new NotFoundException();
    }
    return account;
  }

  private LocalDate parseDueDate(String dueDate) {
    if (dueDate == null || dueDate.isBlank()) {
      throw new WebApplicationException("dueDate is required", 400);
    }
    try {
      return LocalDate.parse(dueDate);
    } catch (Exception e) {
      throw new WebApplicationException("dueDate must be in ISO format (yyyy-MM-dd)", 400);
    }
  }

  public static class ConsolidateRequest {
    public Long accountId;
    public String dueDate;
  }
}
