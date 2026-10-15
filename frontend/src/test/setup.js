// Node >= 22.4 exposes an experimental global `localStorage` that shadows the
// jsdom one vitest would populate, leaving `window.localStorage` undefined
// (and warning about --localstorage-file). Rebind it to a real Storage from
// a dedicated jsdom instance so tests get full localStorage semantics.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost/' });

Object.defineProperty(globalThis, 'localStorage', {
  value: dom.window.localStorage,
  configurable: true,
  writable: true,
});
