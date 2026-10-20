# Migrating the ChatGPT integration: GPT Actions → MCP

Research notes (Oct 2026) on what OpenAI's retirement of Custom GPTs means for the
Ledger integration described in `setup.md`, and what it would take to expose Ledger
as an MCP server instead.

## TL;DR

- Custom GPTs retire **Dec 11, 2026** (creation of new GPTs freezes **Oct 26, 2026**,
  planned). The replacement is **Plugins**, which package skills + connected apps +
  optionally an **MCP server**.
- **GPT Actions do not migrate.** The `/llm` OpenAPI action must be rebuilt as a
  custom MCP server.
- The Ledger backend is Quarkus, and there is a mature Quarkiverse extension,
  `quarkus-mcp-server` (`io.quarkiverse.mcp:quarkus-mcp-server-http`), that exposes
  CDI methods as MCP tools over Streamable HTTP at `/mcp`. The seven `/llm`
  endpoints map almost 1:1 onto MCP tools.
- The one real gap is **authentication**: ChatGPT requires **OAuth 2.1** (per the
  MCP authorization spec) for authenticated MCP servers and *cannot present custom
  API keys* — so the current `led_...` bearer tokens do not work with ChatGPT.
  Claude connectors, by contrast, support a static header credential (beta), so the
  existing token auth could keep working there.

## 1. What is happening to GPTs

Source: [Custom GPT retirement and migration FAQ](https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq)
(help.openai.com, first archived Sep 18, 2026).

- "We're planning to retire custom GPTs and help creators migrate them to plugins."
- Timeline (dates "subject to change"):
  - **Sep 22, 2026** — migration experience + user banner begins rolling out
  - **Oct 26, 2026** (planned) — creation of new custom GPTs ends
  - **Dec 11, 2026** — standard retirement; GPTs and their pages become inaccessible
    (Enterprise deferral: Feb 11, 2027)
- Migration maps: instructions → a **skill**, knowledge files → reference files,
  connected apps → apps. It does **not** carry over: custom actions, sharing
  settings, selected model. Quote: *"GPT custom actions do not transfer through the
  migration workflow… Rebuilding the connection may require a custom MCP server and
  technical setup."*
- The replacement concept: [Plugins in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt) —
  "A plugin can include: **Skills** that provide instructions and workflow guidance…
  **Connected apps**… **App templates**…" The earlier "Apps in ChatGPT / Apps SDK"
  lineage (introduced at DevDay 2025, built on MCP) now lives under the Plugins
  docs: developers.openai.com/apps-sdk redirects to
  [Plugin development for ChatGPT and Codex](https://developers.openai.com/plugins).

**Implication for Ledger:** the existing GPT keeps working until Dec 11, 2026, so
there is no emergency. But there is no automatic migration path for the Action —
rebuilding as MCP is the only option.

## 2. What an MCP server is (60-second version)

[Model Context Protocol spec](https://modelcontextprotocol.io/specification/2025-06-18):

- Open protocol (JSON-RPC 2.0) connecting LLM hosts (ChatGPT, Claude, VS Code) to
  servers that expose three primitives:
  - **Tools** — model-invoked functions with JSON Schema inputs/outputs (this is
    the only primitive Ledger needs; it replaces the 7 OpenAPI operations).
  - **Resources** — URI-addressable context data.
  - **Prompts** — user-invoked templates.
- **Transports**: `stdio` (local subprocess) and **Streamable HTTP** (remote;
  single endpoint, conventionally `/mcp`, POST for JSON-RPC, optional GET for SSE).
  The older HTTP+SSE transport is deprecated. Remote servers for ChatGPT/Claude use
  Streamable HTTP at a public HTTPS URL.
- **Authorization** ([spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)):
  optional in the spec, but required in practice for non-anonymous remote servers.
  OAuth 2.1 with PKCE (S256), Protected Resource Metadata (RFC 9728) at
  `/.well-known/oauth-protected-resource`, authorization-server metadata (RFC 8414),
  the `resource` parameter (RFC 8707) echoed into tokens, and client registration
  via **CIMD** (preferred, new) or **DCR** (RFC 7591, being deprecated).

## 3. What ChatGPT specifically requires

Sources: [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt),
[Authenticate users](https://developers.openai.com/plugins/build/auth),
[Build an MCP server](https://developers.openai.com/plugins/build/mcp-server).

Setup flow (personal use, no publication needed):

1. Deploy the MCP server at a stable **public HTTPS** endpoint (typically `/mcp`),
   Streamable HTTP transport. A **Secure MCP Tunnel** is an alternative that avoids
   exposing the server publicly; a dev tunnel/ngrok works for local testing but not
   for public plugin submission.
2. In ChatGPT: `chatgpt.com/plugins` → **+** → **Add custom MCP server** → enter
   name + server URL → configure authentication → **Create as a plugin**.
3. Test tools via [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
   (`npx @modelcontextprotocol/inspector@latest`) before/after connecting.

Authentication for ChatGPT:

- "For an authenticated MCP server, you are expected to implement an **OAuth 2.1**
  flow that conforms to the MCP authorization spec."
- Hard requirements: protected-resource metadata document, AS metadata with
  `code_challenge_methods_supported: ["S256"]`, authorization-code + PKCE flow,
  `resource` parameter echoed into the access token's audience, redirect URI
  `https://chatgpt.com/connector_platform_oauth_redirect` (stable) or the
  callback-ID-specific variant.
- **"ChatGPT does not support machine-to-machine OAuth grants… nor can it present
  custom API keys or customer-provided mTLS certificates."** — the current
  `led_...` static bearer token cannot be attached to ChatGPT requests.
- Optionally: a `get_profile` tool marked `_meta["openai/profile"]: true` for
  multi-account labeling (nice-to-have, not required for a single-user setup).
- Claude is more lenient: [claude.com/docs/connectors/building](https://claude.com/docs/connectors/building/authentication)
  supports OAuth 2.1 *or* a static request-header credential (beta) — i.e. the
  existing `led_` tokens could work with Claude today.

## 4. Quarkus support (fits the existing backend)

Source: [docs.quarkiverse.io/quarkus-mcp-server](https://docs.quarkiverse.io/quarkus-mcp-server/dev/index.html)
(extension `io.quarkiverse.mcp`, implements MCP spec 2026-07-28).

- Add `io.quarkiverse.mcp:quarkus-mcp-server-http` to `backend/pom.xml`; tools are
  plain CDI bean methods annotated `@Tool(description = ...)` with `@ToolArg`
  parameter docs. JSON Schema generation and validation are automatic. Supports
  Streamable HTTP at `/mcp` (default), legacy SSE at `/mcp/sse`, and stdio via a
  different artifact. Feature methods are transport-agnostic.
- Security integrates with Quarkus Security: HTTP path policies on `/mcp/*`,
  `@RolesAllowed` on tool methods (auth failure surfaces as MCP error `-32005`
  rather than HTTP 401), and OIDC bearer-token support including
  `quarkus.oidc.resource-metadata.enabled=true` for the RFC 9728 discovery document.
  DNS-rebinding (`Origin` header) validation is built in.
- Reference docs: [transports](https://docs.quarkiverse.io/quarkus-mcp-server/dev/concepts-transports.html),
  [tools guide](https://docs.quarkiverse.io/quarkus-mcp-server/dev/guides-implementing-tools.html),
  [security](https://docs.quarkiverse.io/quarkus-mcp-server/dev/reference-security.html).

## 5. Mapping the existing `/llm` API onto MCP

`LlmResource` (backend/src/main/java/com/ledger/resource/LlmResource.java) is
already shaped for LLM consumption — pre-aggregated, projection-excluding, positive
expense magnitudes. The mapping is direct:

| Current endpoint | MCP tool | Notes |
|---|---|---|
| `GET /llm/summary?month=` | `get_summary(month?)` | accounts, income/expenses, card bills |
| `GET /llm/budgets?month=` | `get_budgets(month?)` | live spend + status words |
| `GET /llm/transactions?...` | `get_transactions(from,to,accountId?,categoryId?,q?,limit?)` | capped at 200 rows |
| `GET /llm/cashflow/by-month?months=` | `get_cashflow_by_month(months?)` | |
| `GET /llm/spending/by-category?...` | `get_spending_by_category(from,to)` | |
| `GET /llm/accounts` | `get_accounts()` | |
| `GET /llm/categories` | `get_categories()` | |

Practical approach: extract the query/aggregation logic from `LlmResource` into an
injectable service, then have both `LlmResource` (for the legacy GPT until Dec 2026)
and a new `LedgerMcpTools` class call it. Tool annotations should carry
`readOnlyHint: true, destructiveHint: false`, and the prose from
`docs/gpt/instructions.md` (how to answer "how much can I still spend on X", never
invent numbers, projections excluded) should move into the tool descriptions and a
plugin skill — that file is effectively the future skill's draft.

Keep everything **read-only**: same scope model as the current `token-read` role.

## 6. The authentication decision (the only real fork in the road)

The MCP plumbing is a day or two of work; auth is the decision. Options:

**A. Minimal embedded OAuth 2.1 in the Ledger backend.** Since this is a
single-user personal app, a small authorization-code + PKCE flow can be implemented
in Quarkus: a consent/authorize page reusing the app's own login, a token endpoint
issuing short-lived JWTs (the app already issues JWTs via `TokenService`), the two
well-known metadata documents, and a hardcoded/pre-registered ChatGPT client.
Effort: medium; avoids new infrastructure. Must get the metadata documents, `iss`
(RFC 9207), `resource` echo, and PKCE exactly right.

**B. External IdP (Auth0/Stytch free tier, or Keycloak).** OpenAI explicitly
recommends an established IdP over hand-rolling. Effort: medium, adds an external
dependency and moves login UI there; Keycloak self-hosted is heavy for a personal
app. See §6b for a detailed comparison.

## 6b. External IdP options in detail (researched Oct 2026)

The split of responsibilities is the same for every provider: **the provider is
the OAuth 2.1 authorization server** (login/consent UI, PKCE, token issuance,
discovery metadata, client registration), while **the Ledger backend remains the
resource server** — it must host `/.well-known/oauth-protected-resource` (RFC 9728)
pointing at the provider, return `401` + `WWW-Authenticate` on unauthenticated
requests, and verify bearer JWTs (signature via provider JWKS, `iss`, `aud`,
`exp`). In Quarkus that verification is just `quarkus-oidc` in `service`
application-type mode pointed at the provider's issuer, plus
`quarkus.oidc.token.audience` set to the MCP server's canonical URL — the same
config pattern for all providers below. Note the generic config works when the
provider publishes OIDC discovery; providers exposing only RFC 8414 metadata need
`quarkus.oidc.discovery-enabled=false` and an explicit JWKS path.

One wrinkle to be aware of everywhere: the MCP spec binds tokens via the RFC 8707
`resource` parameter, which providers historically handled differently from
`audience`. Each provider below has a specific story for getting the MCP URL into
the token's `aud`.

### Auth0 — "Auth for MCP" (GA May 6, 2026)

One of only two providers OpenAI's own auth docs name (developers.openai.com/plugins/build/auth).

- Handles OAuth 2.1 + PKCE, CIMD (recommended; manual import of a hosted client
  metadata document) and DCR (opt-in, off by default), and AS metadata. You still
  host the RFC 9728 protected-resource document yourself.
- **Resource/audience gotcha:** Auth0 natively uses `audience`, not `resource`.
  The fix is the tenant toggle **"Resource Parameter Compatibility Profile"**
  (Settings → Advanced), which is **off by default**; without it a stock MCP
  client gets back an opaque token that fails JWT verification. If both `resource`
  and `audience` are present, `audience` wins. (auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile)
- ChatGPT explicitly supported ("works with Claude, Cursor, VSCode, ChatGPT");
  ChatGPT registers itself via DCR as a *third-party* client, which requires:
  enabling DCR, enabling Application Connections, promoting the connection to
  **domain level** (third-party clients can only use domain-level connections),
  and narrowing advertised scopes.
- **Free tier: $0, up to 25,000 MAU, includes Auth for MCP** — for a single-user
  project the limits that could bite are: only 2 Token Vault connections
  (irrelevant here), **no Roles/RBAC** on Free (role-based tool gating would need
  Essentials at $35/mo — irrelevant for one user), no CIBA, and private_key_jwt
  CIMD clients are Enterprise-only (use the public-client PKCE path instead).
- Sources: auth0.com/ai/docs/mcp, auth0.com/blog/auth0-auth-for-mcp-servers-generally-available,
  auth0.com/blog/adding-ui-auth0-secured-mcp-server-skybridge, auth0.com/pricing.

### Stytch — Connected Apps

The second provider OpenAI's docs name ("hosted provider example").

- Full OAuth 2.1 + PKCE S256, DCR (opt-in) or pre-registration; CIMD **not
  documented** — ChatGPT would register via DCR.
- Token verification: JWKS at `https://<project-domain>/.well-known/jwks.json`,
  `iss` = project domain, **`aud` = Stytch Project ID** (not the MCP URL — the
  resource binding story is weaker than others here).
- **Free tier: 10,000 MAU *and AI agents***, 1,000 M2M tokens, no hard caps
  (pay-as-you-go overage). Custom auth domain recommended for production.
- Sources: stytch.com/docs/guides/connected-apps/mcp-server-overview, stytch.com/pricing.

### WorkOS — AuthKit

- Most complete spec coverage: OAuth 2.1 + PKCE S256, **CIMD (opt-in)**, DCR,
  and **resource indicators done right** — `aud` is the registered Resource
  Indicator, i.e. your MCP server URL exactly as ChatGPT sends it.
- Verification: JWKS `https://<authkit_domain>/oauth2/jwks`, `iss` = AuthKit
  domain, `aud` = MCP URL.
- **Free tier: 1 million users**; custom domain $99/mo. Not named by OpenAI's
  docs but spec-compliant.
- Sources: workos.com/docs/authkit/mcp, workos.com/pricing.

### Descope — Agentic Identity Hub

- OAuth 2.1 + PKCE, CIMD (recommended) + DCR, per-tool scopes; `aud` = MCP
  server URL; `iss` = `…/v1/apps/agentic/<ProjectID>/<MCPServerID>`.
- **Free tier: 7,500 MAU, 2,000 monthly active consents** (MCP auth is metered
  by consents — fine for one user). Pro is $249/mo.
- Sources: docs.descope.com/mcp, descope.com/pricing.

### Clerk

- OAuth 2.1 + PKCE S256, CIMD (recommended) + DCR; verification checks signature,
  `exp/nbf`, and `azp` — **`aud` is not emphasized**, weaker audience binding.
  Best docs/SDKs are Node/Express-centric (`@clerk/mcp-tools`); a Java backend
  would verify the JWT manually via `quarkus-oidc` + JWKS.
- **Free tier: 50,000 MRU per app.**
- Sources: clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server.md, clerk.com/pricing.

### Keycloak (self-hosted)

- Official MCP guide exists, but: MCP 2025-03-26 supported, newer spec revisions
  **experimental**; CIMD and RFC 8707 resource indicators behind
  `--features=cimd` / `--features=resource-indicators` flags.
- **Keycloak explicitly does not support ChatGPT's CIMD document** (ChatGPT uses
  `token_endpoint_auth_methods_supported` from OIDC RP Metadata Choices, which
  Keycloak doesn't implement) — ChatGPT would need DCR or a custom client-policy
  executor. Claude and VS Code are documented working.
- Free (Apache 2.0) but you run and operate another service (JVM, database,
  upgrades) — a heavy addition for a personal app.
- Sources: keycloak.org/securing-apps/mcp-authz-server.

### Decision for Ledger

**Auth0 (Free tier) is the chosen IdP** (decided Oct 2026). It is free at
single-user scale, has the most battle-tested ChatGPT path, and is the provider
OpenAI names first in its plugin auth docs. The backend work reduces to (1) two
well-known endpoints, (2) `quarkus-oidc` bearer verification against Auth0's
JWKS, and (3) mapping the token's `sub`/`email` claim to the Ledger `User`
(trivial with a single real user).

Note what the IdP does *not* replace: the existing `led_` API tokens and
`ApiTokenAuthMechanism` stay as-is for the `/llm` REST API and any non-ChatGPT
clients; the OAuth path would protect only `/mcp/*`.

#### Auth0 setup checklist

Auth0 dashboard (one-time):

1. Create a tenant; create an **API** (Auth0 dashboard → APIs) whose identifier is
   the MCP server's canonical URL, e.g.
   `https://api.ledger-finance.darkroasted.vps-kinghost.net/mcp`. Advertise only
   one narrow scope (e.g. `ledger:read`); Auth0 will not hand a third-party client
   the tenant's whole OIDC scope set.
2. Enable **Settings → Advanced → Resource Parameter Compatibility Profile**
   (off by default) so the RFC 8707 `resource` parameter drives token issuance;
   without it ChatGPT gets an opaque token and JWT verification fails.
3. Enable **Dynamic Client Registration** (opt-in, off by default) so ChatGPT can
   register itself as a client.
4. Enable **Application Connections** and promote the login connection
   (e.g. database or Google) to **domain level** — DCR/third-party clients can
   only use domain-level connections. Enable user-delegated access on the API.
5. On the Free plan there is no Roles/RBAC and private_key_jwt CIMD clients are
   Enterprise-only; both are irrelevant here (one user, public-client PKCE flow).

Ledger backend:

6. Add `io.quarkiverse.mcp:quarkus-mcp-server-http` + `quarkus-oidc`; expose the
   7 read-only tools (§5) with `readOnlyHint` annotations.
7. Serve `GET /.well-known/oauth-protected-resource` returning
   `{"resource": "<mcp-url>", "authorization_servers": ["https://<tenant>.auth0.com"],
   "scopes_supported": ["ledger:read"]}`, and return `401` +
   `WWW-Authenticate: Bearer resource_metadata="..."` on unauthenticated `/mcp`
   calls. (`quarkus.oidc.resource-metadata.enabled=true` covers part of this.)
8. Configure `quarkus-oidc` as a service application against the Auth0 tenant
   (`auth-server-url` = tenant domain, `token.audience` = the API identifier from
   step 1); map `sub`/`email` to the Ledger `User`.
9. Test end-to-end with MCP Inspector before touching ChatGPT.

ChatGPT:

10. `chatgpt.com/plugins` → **+ → Add custom MCP server** → enter the `/mcp` URL →
    authenticate via the Auth0 Universal Login consent screen → **Create as a
    plugin** → port `instructions.md` into the plugin's skill.

**C. Claude-only, keep `led_` tokens.** If Claude (or another MCP client that
accepts static headers) is an acceptable substitute, skip OAuth entirely: add the
MCP endpoint, secure `/mcp/*` with the existing `ApiTokenAuthMechanism`
(`token-read` role), and paste the token as a custom header in the client.
Effort: small. ChatGPT then keeps working via the legacy GPT until Dec 11, 2026
and dies with it.

**D. Anonymous server behind Secure MCP Tunnel.** No OAuth needed because the
server is never public; the tunnel itself gates access. Effort: small-medium;
depends on tunnel availability for personal (non-workspace) accounts — verify
before committing.

For other LLM clients generally (the "for LLMs" part of the question): Streamable
HTTP + the 7 read-only tools + bearer-token auth is understood by Claude, the MCP
Inspector, and most MCP clients. ChatGPT is the demanding one (OAuth 2.1 only).

## 7. Suggested path

1. **Now:** extract `LlmResource` logic into a service; add `quarkus-mcp-server-http`;
   expose the 7 tools with proper descriptions/annotations; secure `/mcp/*` with the
   existing token auth. Test with MCP Inspector. This immediately gives a working
   MCP server for Claude and generic MCP clients.
2. **Before Oct 26, 2026** (GPT creation freeze — irrelevant for an existing GPT)
   and **well before Dec 11, 2026** (retirement): wire ChatGPT auth via Auth0 —
   see the setup checklist in §6b.
3. Package as a ChatGPT plugin: "Add custom MCP server" → create as plugin → port
   `instructions.md` into a skill inside the plugin.

## Open questions

- Does the Secure MCP Tunnel (option D) support personal ChatGPT accounts, or is it
  workspace-only? Needs verification against the live product.
- Exact retirement behavior for *existing* GPTs with Actions on Dec 11, 2026 (the
  FAQ says pages become inaccessible; assume total loss of function).
- If multi-device (phone + desktop) usage matters, confirm the plugin/MCP flows on
  ChatGPT mobile, not just web.

## Sources

- https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq
- https://help.openai.com/en/articles/20001256-plugins-in-chatgpt
- https://developers.openai.com/codex/migrate-custom-gpts
- https://developers.openai.com/plugins (concepts/plugins, concepts/mcp-server,
  build/mcp-server, build/auth, deploy/connect-chatgpt, deploy/submission)
- https://developers.openai.com/api/docs/mcp/
- https://modelcontextprotocol.io/specification/2025-06-18 (overview, transports,
  server/tools)
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization and
  https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://claude.com/docs/connectors/building and .../building/authentication
- https://docs.quarkiverse.io/quarkus-mcp-server/dev/index.html (+ transports,
  tools, security pages)
- https://auth0.com/ai/docs/mcp (+ guides: resource-param-compatibility-profile,
  dynamic-client-registration, manual-cimd-registration)
- https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available
- https://auth0.com/blog/adding-ui-auth0-secured-mcp-server-skybridge
- https://auth0.com/pricing
- https://stytch.com/docs/guides/connected-apps/mcp-server-overview
- https://workos.com/docs/authkit/mcp
- https://docs.descope.com/mcp
- https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server.md
- https://www.keycloak.org/securing-apps/mcp-authz-server
