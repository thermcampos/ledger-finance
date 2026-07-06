# Ledger — Backend (Quarkus)

Java 21, Maven, Quarkus 3.17 (bump `quarkus.platform.version` in `pom.xml` to whatever is current before you build).

## First-time setup

1. **Database.** Create a local Postgres database:
   ```bash
   createdb ledger
   ```
   Or via Docker:
   ```bash
   docker run --name ledger-db -e POSTGRES_USER=ledger -e POSTGRES_PASSWORD=ledger -e POSTGRES_DB=ledger -p 5432:5432 -d postgres:16
   ```

2. **JWT signing keys.** Generate an RSA key pair for signing/verifying tokens:
   ```bash
   cd src/main/resources
   openssl genrsa -out privateKey.pem 2048
   openssl rsa -in privateKey.pem -pubout -out publicKey.pem
   cd ../../../..
   ```
   Both files are read from the classpath as configured in `application.properties`. Do not commit `privateKey.pem` to version control in a real deployment — treat it as a secret.

3. **Run in dev mode:**
   ```bash
   ./mvnw quarkus:dev
   ```
   Dev mode auto-generates the schema from the entities (`drop-and-create`). The API listens on `http://localhost:8080`.

4. **Seed demo data (optional).** With the app running (or the schema otherwise created), load realistic sample data:
   ```bash
   psql -h localhost -U ledger -d ledger -f seed-data.sql
   ```
   Creates a demo user (`demo@ledger.app` / `demo12345`), four accounts, categories, transactions, and July 2026 budgets. IDs are Postgres `IDENTITY` columns, so this script never hardcodes a primary key — safe to run without colliding with rows the app creates afterward. Re-running `quarkus:dev` wipes the schema (drop-and-create), so re-run this script after any restart if you want the data back.

## Building

- JVM jar: `./mvnw package`
- Native executable: `./mvnw package -Pnative` (requires GraalVM/Mandrel, or add `-Dquarkus.native.container-build=true` to build in a container without a local GraalVM install)

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | none | Create a user, returns a JWT |
| POST | `/auth/login` | none | Verify credentials, returns a JWT |
| GET | `/accounts` | Bearer | List the current user's accounts |
| POST | `/accounts` | Bearer | Create an account |
| DELETE | `/accounts/{id}` | Bearer | Remove an account |
| GET | `/categories` | Bearer | List the current user's categories |
| POST | `/categories` | Bearer | Create a category |
| GET | `/transactions/account/{accountId}` | Bearer | List transactions for an account |
| POST | `/transactions` | Bearer | Record a transaction, updates account balance |
| GET | `/budgets/month/{yyyy-MM}` | Bearer | List budgets for a given month |
| GET | `/budgets/month/{yyyy-MM}/spend` | Bearer | Per-category spend total for a given month, derived live from transactions |
| POST | `/budgets` | Bearer | Create or update a budget limit |

## Notes / next steps

- **Migrations:** schema generation is set to `drop-and-create` in dev and `validate` in prod on purpose — add Flyway once the entity model settles, so production schema changes are explicit and reviewable.
- **Refresh tokens:** the current JWT is a 7-day bearer token with no refresh flow. Fine for a personal app; revisit if you want shorter-lived access tokens.
- **CORS** is currently locked to `http://localhost:5173` (the Vite dev server) — update `quarkus.http.cors.origins` for your deployed frontend origin.
