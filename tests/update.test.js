import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The update path has failed twice, both times silently: once because the
// prompt posted to a service worker that was never in the waiting state, and
// once because the version lived in a file that could be cached separately
// from the page reporting it. Nothing here is clever - it just holds the
// contract in place, because when this breaks the app stops updating forever
// and the only symptom is a version number that will not move.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

function declaredVersion() {
  const m = html.match(/const\s+APP_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

describe('version declaration', () => {
  it('is declared exactly once', () => {
    const all = [...html.matchAll(/const\s+APP_VERSION\s*=\s*'([^']+)'/g)];
    expect(all).toHaveLength(1);
  });

  it('lives in index.html, not a separate file that could cache apart from it', () => {
    expect(html).not.toMatch(/src=["']\.\/version\.js/);
    expect(worker).not.toMatch(/importScripts/);
  });

  it('is dated and sequenced', () => {
    expect(declaredVersion()).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/);
  });
});

describe('update check', () => {
  // Pull the pattern out of the shipped source rather than copying it, so the
  // test fails if either the pattern or the declaration drifts.
  function shippedPattern() {
    const m = html.match(/text\.match\((\/.+?\/)\)/);
    if (!m) throw new Error('Could not find the version pattern in the update check');
    const body = m[1].slice(1, -1);
    return new RegExp(body);
  }

  it('can read this file own version with its own pattern', () => {
    const match = html.match(shippedPattern());
    expect(match, 'update check pattern found no version in index.html').toBeTruthy();
    expect(match[1]).toBe(declaredVersion());
  });

  it('polls index.html, which the worker always serves network first', () => {
    expect(html).toMatch(/fetch\(`\.\/index\.html\?ts=\$\{Date\.now\(\)\}`/);
    expect(html).toMatch(/cache:\s*'no-store'/);
  });

  it('clears caches and unregisters workers before reloading', () => {
    const apply = html.slice(html.indexOf('async function applyUpdate'));
    const body = apply.slice(0, apply.indexOf('\n  }'));
    expect(body).toMatch(/caches\.keys\(\)/);
    expect(body).toMatch(/caches\.delete/);
    expect(body).toMatch(/getRegistrations\(\)/);
    expect(body).toMatch(/unregister\(\)/);
    expect(body).toMatch(/location\.reload\(\)/);
  });

  it('rechecks when the app comes back to the foreground', () => {
    expect(html).toMatch(/visibilitychange/);
    expect(html).toMatch(/visibilityState === 'visible'/);
  });

  it('points the menu Refresh item at the same path, so it cannot no-op', () => {
    expect(html).toMatch(/action === 'refresh'\)\s*applyUpdate\(\)/);
  });

  it('does not reload on controllerchange, which used to race the prompt', () => {
    const start = html.indexOf("if ('serviceWorker' in navigator)");
    expect(start, 'service worker registration block not found').toBeGreaterThan(-1);
    const registration = html.slice(start);
    expect(registration).toMatch(/serviceWorker\.register\(/);
    expect(registration).not.toMatch(/controllerchange/);
    expect(registration).not.toMatch(/location\.reload/);
  });
});

describe('service worker', () => {
  it('takes its version from the ?v= it was registered with', () => {
    expect(worker).toMatch(/searchParams\.get\('v'\)/);
    expect(worker).toMatch(/const CACHE_NAME = `quickcorn-\$\{APP_VERSION\}`/);
  });

  it('is registered with the version in the URL, which is what forces an update', () => {
    // The worker file is byte identical between releases, so a changing script
    // URL is the only thing that makes the browser install the new one.
    expect(html).toMatch(/register\(`\.\/service-worker\.js\?v=\$\{[^`]+\}`/);
    expect(html).toMatch(/updateViaCache:\s*'none'/);
  });

  it('carries no version literal of its own to fall out of step', () => {
    expect(worker).not.toMatch(/\d{4}\.\d{2}\.\d{2}\.\d{2}/);
  });

  it('serves the shell network first so a stale copy cannot pin the app', () => {
    expect(worker).toMatch(/function networkFirst/);
    expect(worker).toMatch(/fetch\(request,\s*\{\s*cache:\s*'no-store'\s*\}\)/);
  });

  it('revalidates everything else rather than caching it forever', () => {
    // A cache-first catch-all is what pinned version.js on a real device.
    const fetchHandler = worker.slice(worker.indexOf("addEventListener('fetch'"));
    expect(fetchHandler).toMatch(/event\.waitUntil\(network/);
  });
});
