// Theme state — the single source of truth for dark/light.
//
// Dark-first: dark is the default and renders on first visit (empty storage).
// `prefers-color-scheme` is deliberately never consulted — the only input is
// the explicit stored choice. Persistence is localStorage only, per-device;
// there is no backend. See docs/light-theme.md.
//
// Keeps Bootstrap's own `data-bs-theme` attribute in sync so its compiled
// color-mode values track ours instead of fighting them.

export const THEMES = ['dark', 'light'];
export const DEFAULT_THEME = 'dark';
const STORAGE_KEY = 'ledger-theme';

export function getStoredTheme() {
  let stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, disabled) — fall through.
  }
  return THEMES.includes(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  const root = document.documentElement;
  root.setAttribute('data-theme', value);
  root.setAttribute('data-bs-theme', value);
}

export function setTheme(theme) {
  const value = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: apply for this session even if it can't be persisted.
  }
  applyTheme(value);
  return value;
}

// Re-assert the stored theme on the live document. The inline boot script in
// index.html already did this before first paint; this covers SPA re-mounts.
export function initTheme() {
  applyTheme(getStoredTheme());
}
