import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredTheme, setTheme, initTheme, DEFAULT_THEME } from './theme';

const KEY = 'ledger-theme';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-bs-theme');
});

describe('getStoredTheme', () => {
  it('defaults to dark when storage is empty', () => {
    expect(getStoredTheme()).toBe('dark');
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('returns a stored light preference', () => {
    window.localStorage.setItem(KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it('falls back to dark for an invalid stored value', () => {
    window.localStorage.setItem(KEY, 'sepia');
    expect(getStoredTheme()).toBe('dark');
  });

  it('falls back to dark when localStorage throws', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getStoredTheme()).toBe('dark');
    spy.mockRestore();
  });
});

describe('setTheme', () => {
  it('persists the preference and applies it to the root element', () => {
    setTheme('light');
    expect(window.localStorage.getItem(KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('keeps the Bootstrap data-bs-theme attribute in sync', () => {
    setTheme('light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  it('coerces an unknown value to the default', () => {
    setTheme('neon');
    expect(window.localStorage.getItem(KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('initTheme', () => {
  it('applies the stored theme to the document', () => {
    window.localStorage.setItem(KEY, 'light');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  it('applies dark when nothing is stored', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
