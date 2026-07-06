package com.ledger.category;

import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
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

    @Inject
    CurrentUserService currentUser;

    @GET
    public List<Category> list() {
        return Category.findByUser(currentUser.require().id);
    }

    @POST
    @Transactional
    public Category create(@Valid CreateCategoryRequest request) {
        Category category = new Category();
        category.user = currentUser.require();
        category.name = request.name;
        category.colorHex = request.colorHex;
        category.persist();
        return category;
    }

    public static class CreateCategoryRequest {
        @NotBlank
        public String name;
        public String colorHex;
    }
}
