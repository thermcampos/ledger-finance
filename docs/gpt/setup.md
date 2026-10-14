# Wiring ChatGPT to your Ledger

This guide connects a ChatGPT Custom GPT to your Ledger account through the read-only
`/llm` API, so you can ask questions about your money from the ChatGPT app (mobile
included). It takes about five minutes.

What you need:

- A Ledger account on `https://ledger-finance.darkroasted.vps-kinghost.net`
- A ChatGPT plan that can create GPTs (Plus or better)
- The two files in this folder: `instructions.md` and `openapi.yaml`

## 1. Create an API token in Ledger

1. Log in to Ledger and open **Profile**.
2. Scroll to the **API tokens** panel.
3. Give the token a name (e.g. `ChatGPT`), leave the scope on **Read**, and click
   **Create token**.
4. Copy the token shown (it starts with `led_`) and keep it somewhere safe for the
   next steps. **It is shown only once** — if you lose it, revoke it and create
   another.

The token is read-only: the GPT can look, but it can never create, edit, or delete
anything in your ledger. It expires after one year, and you can revoke it any time
from the same panel (revoking takes effect immediately).

## 2. Create the GPT

1. In ChatGPT, go to **Explore GPTs → Create** (on the web; GPTs can't be created
   from the mobile app, but once created they work there).
2. Switch to the **Configure** tab.
3. Name: `Ledger` (or anything you like).
4. Description: e.g. `Answers questions about my personal finances.`
5. **Instructions**: paste the entire contents of `instructions.md` (everything below
   the divider line).

## 3. Add the Ledger API as an Action

1. Still on the **Configure** tab, click **Create new action**.
2. Under **Schema**, click **Import** and paste the full contents of `openapi.yaml`.
   You should see 7 available operations listed (`getSummary`, `getBudgets`,
   `getTransactions`, `getCashflowByMonth`, `getSpendingByCategory`, `getAccounts`,
   `getCategories`).
3. Under **Authentication**, choose **API Key**, paste your `led_...` token into the
   API Key field, and set **Auth Type** to **Bearer**.
4. Leave **Privacy Policy** empty (personal use) and save the action.

## 4. Save and test

1. Click **Create** (or **Update**) in the top right, then **View GPT**.
2. Try the canonical questions:
   - "How much have I spent with groceries this month?"
   - "How much can I still spend with gasoline this month?" — if you have no gasoline
     budget, the correct answer is that there is no budget for it (the GPT must not
     invent a number).
   - "What's the current credit card bills amount?"
   - "How much income did I have in the last three months?"
3. On mobile, open the ChatGPT app and pick your Ledger GPT from the GPTs list.

## Notes and limits

- **Read-only by design.** Asking the GPT to change anything will be declined; use the
  Ledger app for edits.
- **Rate limit:** 60 requests per minute per token — far above normal conversation.
- **Data freshness:** balances and budget spend are live, computed at request time.
- **Projections are excluded:** upcoming card bills and budget projections never
  double-count in answers; card bill totals come from the bills themselves.
- **One token per integration.** If you later wire another tool, create a separate
  token so you can revoke them independently.
- If the GPT answers with obviously wrong numbers or claims the API failed, open the
  Profile page and check the token's **last used** timestamp — if it never updates,
  the Action's authentication is misconfigured (step 3).
