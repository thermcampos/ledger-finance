# Light theme — design decisions

Status: **implemented** (2026-09-02, branch `feat/4-add-light-theme`). Captured from a grilling session on 2026-02-09. `AGENTS.md` / `CLAUDE.md` design-language section updated in the same PR (see [Docs](#docs)). This document remains the decision record.

## Why this exists

`AGENTS.md` currently states **"Dark mode only. No light theme, no toggle."** This feature reverses that documented decision, so the reversal needs a recorded reason:

- The app's only real user uses it in daylight and misses a light mode. That is the entire justification — a personal app serving its owner's real need, not a hypothetical-user "apps should have a toggle" reflex.
- The "dark mode only" rule was a design-identity statement, not a technical constraint. The identity stays dark-first (see [Defaults](#defaults-and-persistence)); light mode is an accommodation, not a new citizen.

## Decisions

### Scope and audience

- **Real daylight need, confirmed by the owner.** Build it.
- **Both themes are permanent.** Every future UI change must be checked in dark and light. The existing class of design rules ("every monetary figure is monospace, right-aligned, tabular") gains a standing sibling: **works in both themes**. This maintenance tax was explicitly accepted.

### Palette

- **Designed from accessibility guidelines, not inverted.** The dark palette (`#4FA98A` jade, `#C75450` brick, `#C9A227` gold on `#0E1116` ink-navy) was tuned for dark backgrounds; naive inversion fails contrast (e.g. jade on white is ~2.3:1, gold ~2.2:1 — both below WCAG AA).
- **Same personality, new values.** The light palette must keep the "muted, not neon" discipline: a paper-like background (the ledger-book feel), ink-like text, and darker/desaturated variants of jade, brick, and gold that meet WCAG AA (4.5:1 for text, 3:1 for decorative/large elements).
- **Gold stays reserved** for "near limit" warnings only, in both themes.
- Palette values are delegated to the implementer, verified with a contrast-checking script before landing.

### Defaults and persistence

- **Dark remains the default.** First visit (empty `localStorage`) renders dark.
- **No OS/browser following.** `prefers-color-scheme` is deliberately ignored. Theme only changes via the explicit toggle.
- **Persistence: `localStorage` only.** Zero backend: no user column, no Flyway migration, no API change. The preference is per-device.

### Toggle placement

- **Profile page** (`frontend/src/pages/Profile.jsx`). Not the header, not the sidebar.

### Public pages

- **Theme applies app-wide, including logged-out pages** — `Landing`, `Login`, `Signup`, `Terms`, `Privacy` all read the stored preference on load. A user who chose light never gets a dark flash at login.
- Rationale: one code path, no theme gate at the auth boundary, and the owner is the audience for the landing page too.

## Technical findings (from codebase survey)

- **Tokens are already CSS custom properties** on `:root` in `frontend/src/styles/tokens.scss` — themeable via an attribute selector (e.g. `[data-theme='light']`).
- **`index.html` already sets `data-bs-theme="dark"`** on `<html>`; Bootstrap 5.3.8 is in use. Decide during implementation whether to drive Bootstrap's own color-mode vars or keep a custom attribute; whichever is chosen, Bootstrap's compiled-in dark values must not leak into light mode.
- **Bootstrap Sass overrides are compile-time.** `tokens.scss` sets `$body-bg`, `$body-color`, `$border-color`, `$primary`, `$danger`, `$warning` — these bake dark hexes into Bootstrap's compiled CSS and will not respond to a runtime toggle. They must be mapped to `var(--…)` references (or otherwise routed through the chosen color-mode mechanism).
- **~14 hardcoded hex colors in `main.scss` bypass tokens** and must be migrated: body backgrounds (lines 6, 14), card/row hover borders `#39414F` (lines 286, 442, 458, 486), button colors (lines 789, 794–796, 801, 806–808). Also two hardcoded `rgba()` values: the sticky-header backdrop `rgba(14, 17, 22, 0.82)` (line 185) and the jade icon border `rgba(79, 169, 138, 0.45)` (lines 446, 462).
- **No existing theme infrastructure** — no `prefers-color-scheme`, no `data-theme`, nothing to clean up.

## Build order (forced, confirmed)

1. **Prerequisite refactor — tokenize everything.** Migrate all hardcoded hexes/rgbas in `main.scss` to CSS variables (adding tokens like `--border-strong` as needed) and route Bootstrap's Sass vars through CSS vars. **Zero visual change** is the acceptance bar for this step.
2. **Light palette.** Add the `[data-theme='light']` token block; verify every text/semantic color against its background with a WCAG contrast script.
3. **Theme infrastructure.** Inline boot script in `index.html` that reads `localStorage` and sets the theme attribute **before first paint** (no flash of wrong theme); a small `utils/theme.js` with get/set/apply; keep any Bootstrap attribute in sync.
4. **Profile toggle.** Dark/Light control on the Profile page, writing to `localStorage` and applying immediately.
5. **Docs.** Update `AGENTS.md` and `CLAUDE.md` (below) in the same PR.

## Docs

When this ships, the design-language section of `AGENTS.md` / `CLAUDE.md` changes:

- Strike "Dark mode only. No light theme, no toggle."
- Replace with: dark-first identity, light theme as an explicit per-device choice; dark is the default; `prefers-color-scheme` is ignored; every new UI must work in both themes; all colors come from `tokens.scss` (hardcoded hexes are now a lintable offense by convention).
- The non-negotiables are unchanged in both themes: monospace right-aligned tabular figures, Fraunces only for hero/titles, no charts, muted palette, hairline borders.

## Explicitly rejected

| Idea | Why |
| --- | --- |
| Following `prefers-color-scheme` | A finance ledger flipping appearance because the OS changed is surprising; the identity is dark-first and the choice is explicit. |
| Server-side theme preference | Per-user column + migration + API for a single-user app is ceremony; per-device `localStorage` is sufficient. |
| Auto-inverting the dark palette | Fails WCAG contrast and breaks the muted-palette discipline. |
| Toggle in header/sidebar | Profile page keeps the chrome minimal; theme is a set-and-forget preference. |
| Light as default | The app's identity is the dark ledger; light is an accommodation. |
