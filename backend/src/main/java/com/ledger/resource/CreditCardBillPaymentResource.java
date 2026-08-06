package com.ledger.resource;

import com.ledger.entity.Account;
import com.ledger.entity.Category;
import com.ledger.entity.CreditCardBill;
import com.ledger.entity.Transaction;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import com.ledger.security.CurrentUserService;
import com.ledger.service.CreditCardBillSyncService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.math.BigDecimal;
import java.time.LocalDate;

@Path("/credit-cards-bills/{accountId}/payment")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CreditCardBillPaymentResource {

  @Inject CurrentUserService currentUser;

  @Inject CreditCardBillSyncService billSync;

  @POST
  @Transactional
  public CreditCardBill pay(@PathParam("accountId") Long accountId, PayBillRequest request) {
    Account card = requireOwnedCreditCard(accountId);
    LocalDate dueDate = parseDate(request.dueDate, "dueDate");
    LocalDate paymentDate = parseDate(request.paymentDate, "paymentDate");
    Account paymentAccount = resolvePaymentAccount(card, request.paymentAccountId);

    BigDecimal total = billSync.billTotal(card, dueDate);
    if (total.signum() == 0) {
      throw new WebApplicationException("Bill total is zero", 400);
    }

    CreditCardBill bill = CreditCardBill.findByAccountAndDueDate(card.id, dueDate);
    if (bill != null && bill.paid) {
      throw new WebApplicationException("Bill already paid", 409);
    }
    if (bill == null) {
      bill = new CreditCardBill();
      bill.account = card;
      bill.dueDate = dueDate;
    }

    Transaction payment =
        createPaymentTransaction(
            card, paymentAccount, paymentDate, total, request.completed, request.debitAuthorized);

    bill.paid = true;
    bill.paymentDate = paymentDate;
    bill.paymentAccount = paymentAccount;
    bill.paymentTransaction = payment;
    bill.persist();

    billSync.recomputeAccountBalance(paymentAccount);
    billSync.sync(card);

    return bill;
  }

  @PUT
  @Transactional
  public CreditCardBill updatePayment(
      @PathParam("accountId") Long accountId, PayBillRequest request) {
    Account card = requireOwnedCreditCard(accountId);
    LocalDate dueDate = parseDate(request.dueDate, "dueDate");
    LocalDate paymentDate = parseDate(request.paymentDate, "paymentDate");
    Account paymentAccount = resolvePaymentAccount(card, request.paymentAccountId);

    CreditCardBill bill = requirePaidBill(card, dueDate);
    Transaction payment = bill.paymentTransaction;
    Account previousAccount = payment.account;

    payment.account = paymentAccount;
    payment.occurredOn = paymentDate;
    payment.completed = request.completed;
    payment.debitAuthorized = request.debitAuthorized;

    bill.paymentDate = paymentDate;
    bill.paymentAccount = paymentAccount;

    if (!previousAccount.id.equals(paymentAccount.id)) {
      billSync.recomputeAccountBalance(previousAccount);
    }
    billSync.recomputeAccountBalance(paymentAccount);
    billSync.sync(card);

    return bill;
  }

  @DELETE
  @Transactional
  public void unpay(@PathParam("accountId") Long accountId, @QueryParam("dueDate") String dueDate) {
    Account card = requireOwnedCreditCard(accountId);
    LocalDate date = parseDate(dueDate, "dueDate");
    CreditCardBill bill = requirePaidBill(card, date);

    Account paymentAccount = bill.paymentAccount;
    Transaction payment = bill.paymentTransaction;

    bill.paid = false;
    bill.paymentDate = null;
    bill.paymentAccount = null;
    bill.paymentTransaction = null;

    if (payment != null) {
      payment.delete();
    }

    if (paymentAccount != null) {
      billSync.recomputeAccountBalance(paymentAccount);
    }
    billSync.sync(card);
  }

  private Account requireOwnedCreditCard(Long accountId) {
    User user = currentUser.require();
    if (accountId == null) {
      throw new WebApplicationException("accountId is required", 400);
    }
    Account account = Account.findById(accountId);
    if (account == null || !account.user.id.equals(user.id)) {
      throw new NotFoundException();
    }
    if (account.kind != AccountKind.CREDIT_CARD) {
      throw new WebApplicationException("Account is not a credit card", 400);
    }
    return account;
  }

  private Account resolvePaymentAccount(Account card, Long paymentAccountId) {
    Account paymentAccount;
    if (paymentAccountId != null) {
      paymentAccount = Account.findById(paymentAccountId);
      if (paymentAccount == null || !paymentAccount.user.id.equals(card.user.id)) {
        throw new NotFoundException("Payment account not found");
      }
    } else if (card.paymentAccount != null) {
      paymentAccount = card.paymentAccount;
    } else {
      throw new WebApplicationException("No payment account selected for this card", 400);
    }

    if (paymentAccount.kind != AccountKind.CHECKING && paymentAccount.kind != AccountKind.SAVINGS) {
      throw new WebApplicationException("Payment account must be checking or savings", 400);
    }
    if (paymentAccount.id.equals(card.id)) {
      throw new WebApplicationException("Payment account cannot be the credit card itself", 400);
    }
    return paymentAccount;
  }

  private CreditCardBill requirePaidBill(Account card, LocalDate dueDate) {
    CreditCardBill bill = CreditCardBill.findByAccountAndDueDate(card.id, dueDate);
    if (bill == null || !bill.paid) {
      throw new WebApplicationException("Bill is not paid", 400);
    }
    return bill;
  }

  private Transaction createPaymentTransaction(
      Account card,
      Account paymentAccount,
      LocalDate paymentDate,
      BigDecimal amount,
      Boolean completed,
      Boolean debitAuthorized) {
    Transaction txn = new Transaction();
    txn.account = paymentAccount;
    txn.category = findOrCreateCardPaymentCategory(card.user);
    txn.description = "Credit card payment — " + card.name;
    txn.amount = amount;
    txn.occurredOn = paymentDate;
    txn.completed = completed != null ? completed : Boolean.FALSE;
    txn.debitAuthorized = debitAuthorized != null ? debitAuthorized : Boolean.FALSE;
    txn.persist();
    return txn;
  }

  private Category findOrCreateCardPaymentCategory(User user) {
    Category existing = Category.findByUserAndName(user.id, "Card payment");
    if (existing != null) {
      return existing;
    }
    Category category = new Category();
    category.user = user;
    category.name = "Card payment";
    category.colorHex = "#8B92A0";
    category.icon = "bi-credit-card";
    category.internal = true;
    category.persist();
    return category;
  }

  private LocalDate parseDate(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new WebApplicationException(fieldName + " is required", 400);
    }
    try {
      return LocalDate.parse(value);
    } catch (Exception e) {
      throw new WebApplicationException(
          fieldName + " must be in ISO format (yyyy-MM-dd)", 400);
    }
  }

  public static class PayBillRequest {
    public String dueDate;
    public String paymentDate;
    public Long paymentAccountId;
    public Boolean completed;
    public Boolean debitAuthorized;
  }
}
