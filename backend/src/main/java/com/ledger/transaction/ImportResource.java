package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;

@Path("/transactions/import")
@RolesAllowed("user")
@Produces(MediaType.APPLICATION_JSON)
public class ImportResource {

    @Inject
    CurrentUserService currentUser;

    @Inject
    CsvImportService csvImportService;

    @Inject
    PdfImportService pdfImportService;

    @POST
    @Path("/parse")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public List<ParsedImportRow> parse(@RestForm FileUpload file, @RestForm Long accountId) {
        requireOwnedAccount(accountId);
        if (file == null) {
            throw new WebApplicationException("No file uploaded", 400);
        }

        String name = file.fileName() == null ? "" : file.fileName().toLowerCase(Locale.ROOT);
        try (InputStream in = Files.newInputStream(file.filePath())) {
            if (name.endsWith(".csv")) {
                return csvImportService.parse(in);
            } else if (name.endsWith(".pdf")) {
                return pdfImportService.parse(in);
            } else {
                throw new WebApplicationException("Unsupported file type — use .csv or .pdf", 400);
            }
        } catch (IOException e) {
            throw new WebApplicationException("Couldn't read the uploaded file", 400);
        }
    }

    private Account requireOwnedAccount(Long accountId) {
        User user = currentUser.require();
        Account account = accountId == null ? null : Account.findById(accountId);
        if (account == null || !account.user.id.equals(user.id)) {
            throw new NotFoundException("Account not found");
        }
        return account;
    }
}
