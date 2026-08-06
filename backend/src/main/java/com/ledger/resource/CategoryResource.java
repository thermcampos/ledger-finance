package com.ledger.resource;

import com.ledger.entity.Category;
import com.ledger.entity.Budget;
import com.ledger.security.CurrentUserService;
import com.ledger.entity.Transaction;
import com.ledger.entity.User;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

@Path("/categories")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CategoryResource {

  @Inject CurrentUserService currentUser;

  @GET
  public List<Category> list() {
    return Category.findVisibleByUser(currentUser.require().id);
  }

  @POST
  @Transactional
  public Category create(@Valid CreateCategoryRequest request) {
    Category category = new Category();
    category.user = currentUser.require();
    category.name = request.name;
    category.colorHex = request.colorHex;
    category.icon = request.icon;
    category.persist();
    return category;
  }

  @PUT
  @Path("/{id}")
  @Transactional
  public Category update(@PathParam("id") Long id, @Valid CreateCategoryRequest request) {
    Category category = requireOwnedCategory(id);
    if (category.internal) {
      throw new WebApplicationException("Cannot edit a system category", 400);
    }
    category.name = request.name;
    category.colorHex = request.colorHex;
    category.icon = request.icon;
    return category;
  }

  @GET
  @Path("/{id}/usage")
  public CategoryUsage usage(@PathParam("id") Long id) {
    Category category = requireOwnedCategory(id);
    long transactionCount = Transaction.count("category.id", category.id);
    long budgetCount = Budget.count("category.id", category.id);
    return new CategoryUsage(transactionCount, budgetCount);
  }

  @DELETE
  @Path("/{id}")
  @Transactional
  public void delete(@PathParam("id") Long id) {
    Category category = requireOwnedCategory(id);
    if (category.internal) {
      throw new WebApplicationException("Cannot delete a system category", 400);
    }
    boolean used =
        Transaction.count("category.id", category.id) > 0
            || Budget.count("category.id", category.id) > 0;
    if (used) {
      throw new WebApplicationException(
          "Cannot delete a category used by transactions or budgets", 409);
    }
    category.delete();
  }

  private Category requireOwnedCategory(Long id) {
    User user = currentUser.require();
    Category category = Category.findById(id);
    if (category == null || !category.user.id.equals(user.id)) {
      throw new NotFoundException();
    }
    return category;
  }

  public static class CreateCategoryRequest {
    @NotBlank public String name;
    public String colorHex;
    public String icon;
  }

  public static class CategoryUsage {
    public long transactionCount;
    public long budgetCount;

    public CategoryUsage(long transactionCount, long budgetCount) {
      this.transactionCount = transactionCount;
      this.budgetCount = budgetCount;
    }
  }
}
