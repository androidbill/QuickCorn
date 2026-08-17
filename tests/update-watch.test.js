/**
 * @vitest-environment happy-dom
 *
 * What the update watch actually does, as opposed to what its source says.
 *
 * update.test.js holds the contract in place by reading the source, which is
 * how it catches a declaration drifting away from the pattern that reads it.
 * It cannot catch the watch never firing. This runs it: a stubbed fetch stands
 * in for the served page, and the clock is driven forward by hand.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startUpdateWatch } from '../js/update.js';

const RUNNING = '2026.08.16.16';

/** Serve a page declaring `version`, the way index.html does. */
function serve(version) {
  return vi.fn(async () => ({
    ok: true,
    text: async () => `<script>window.APP_VERSION = '${version}';</script>`,
  }));
}

function foreground() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/* The watch listens on document and window and has no teardown - it is started
   once for the life of the page. The document outlives a test though, so
   without this each test would leave a live watcher behind and the next one
   would count its fetches too. Record what a test registers, and take it back
   off afterwards. */
let registered = [];

beforeEach(() => {
  vi.useFakeTimers();
  // The watch registers a service worker on load; there is none here.
  vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });

  registered = [];
  for (const target of [document, window]) {
    const original = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, options) => {
      registered.push([target, type, fn, options]);
      original(type, fn, options);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [target, type, fn, options] of registered) target.removeEventListener(type, fn, options);
  registered = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('opening the app', () => {
  it('checks straight away and prompts when a newer version is served', async () => {
    vi.stubGlobal('fetch', serve('2026.08.16.20'));
    const onUpdate = vi.fn();

    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).toHaveBeenCalledWith('2026.08.16.20');
  });

  it('says nothing when the served version is the one running', async () => {
    vi.stubGlobal('fetch', serve(RUNNING));
    const onUpdate = vi.fn();

    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('asks for the page uncached, so a stale copy cannot hide the update', async () => {
    const fetchMock = serve(RUNNING);
    vi.stubGlobal('fetch', fetchMock);

    startUpdateWatch(RUNNING, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^\.\/index\.html\?ts=\d+/);
    expect(options).toMatchObject({ cache: 'no-store' });
  });
});

describe('while the app is open', () => {
  it('checks again when it comes back to the foreground', async () => {
    const fetchMock = serve(RUNNING);
    vi.stubGlobal('fetch', fetchMock);
    startUpdateWatch(RUNNING, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    foreground();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps checking on a timer for an app left open on the table', async () => {
    const fetchMock = serve(RUNNING);
    vi.stubGlobal('fetch', fetchMock);
    startUpdateWatch(RUNNING, vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('prompts for a version published after the app was opened', async () => {
    // The realistic case: open on the current version, then a release lands.
    vi.stubGlobal('fetch', serve(RUNNING));
    const onUpdate = vi.fn();
    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', serve('2026.08.16.21'));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(onUpdate).toHaveBeenCalledWith('2026.08.16.21');
  });

  it('prompts once, not on every check afterwards', async () => {
    vi.stubGlobal('fetch', serve('2026.08.16.20'));
    const onUpdate = vi.fn();
    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    foreground();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('with no signal', () => {
  it('stays quiet rather than throwing, and picks it up on the next check', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const onUpdate = vi.fn();
    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', serve('2026.08.16.22'));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(onUpdate).toHaveBeenCalledWith('2026.08.16.22');
  });

  it('ignores a response that is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => '' })));
    const onUpdate = vi.fn();

    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('checks as soon as the connection comes back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const onUpdate = vi.fn();
    startUpdateWatch(RUNNING, onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    vi.stubGlobal('fetch', serve('2026.08.16.23'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    // Without this the next word of an update could be five minutes away.
    expect(onUpdate).toHaveBeenCalledWith('2026.08.16.23');
  });
});
