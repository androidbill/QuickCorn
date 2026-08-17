import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The update path has failed twice, both times silently: once because the
// prompt posted to a service worker that was never in the waiting state, and
// once because the version lived in a file that could be cached separately
// from the page reporting it. Nothing here is clever - it just holds the
// contract in place, because when this breaks the app stops updating forever
// and the only symptom is a version number that will not move.
//
// Carried over when the rebuild replaced the single-file app. The mechanism is
// spread across three files now rather than living in one, which makes the
// contract easier to break by editing just one of them, not harder.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const update = readFileSync(new URL('../js/update.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function declaredVersion() {
  const m = html.match(/window\.APP_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

describe('version declaration', () => {
  it('is declared exactly once', () => {
    const all = [...html.matchAll(/window\.APP_VERSION\s*=\s*'([^']+)'/g)];
    expect(all).toHaveLength(1);
  });

  it('lives in index.html, not a separate file that could cache apart from it', () => {
    expect(html).not.toMatch(/src=["']\.\/version\.js/);
    expect(worker).not.toMatch(/importScripts/);
    // No module may declare its own copy for the page to drift away from.
    for (const [name, source] of [['update.js', update], ['app.js', app]]) {
      expect(source, `${name} declares its own version`).not.toMatch(/APP_VERSION\s*=\s*'\d{4}\./);
    }
  });

  it('is dated and sequenced', () => {
    expect(declaredVersion()).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/);
  });
});

describe('update check', () => {
  // Pull the pattern out of the shipped source rather than copying it, so the
  // test fails if either the pattern or the declaration drifts.
  function shippedPattern() {
    const m = update.match(/text\.match\((\/.+?\/)\)/);
    if (!m) throw new Error('Could not find the version pattern in the update check');
    return new RegExp(m[1].slice(1, -1));
  }

  it('can read the shipped page own version with its own pattern', () => {
    const match = html.match(shippedPattern());
    expect(match, 'update check pattern found no version in index.html').toBeTruthy();
    expect(match[1]).toBe(declaredVersion());
  });

  it('polls index.html, which the worker always serves network first', () => {
    expect(update).toMatch(/fetch\(`\.\/index\.html\?ts=\$\{Date\.now\(\)\}`/);
    expect(update).toMatch(/cache:\s*'no-store'/);
  });

  it('clears caches and unregisters workers before reloading', () => {
    const apply = update.slice(update.indexOf('export async function applyUpdate'));
    const body = apply.slice(0, apply.indexOf('\n}'));
    expect(body).toMatch(/caches\.keys\(\)/);
    expect(body).toMatch(/caches\.delete/);
    expect(body).toMatch(/getRegistrations\(\)/);
    expect(body).toMatch(/unregister\(\)/);
    expect(body).toMatch(/location\.reload\(\)/);
  });

  it('rechecks when the app comes back to the foreground', () => {
    expect(update).toMatch(/visibilitychange/);
    expect(update).toMatch(/visibilityState === 'visible'/);
  });

  it('points the menu Refresh item at the same path, so it cannot no-op', () => {
    expect(app).toMatch(/refresh:\s*applyUpdate/);
    expect(app).toMatch(/import \{[^}]*applyUpdate[^}]*\} from '\.\/update\.js'/);
  });

  it('does not reload on controllerchange, which used to race the prompt', () => {
    expect(update).toMatch(/serviceWorker\s*\n?\s*\.register\(|serviceWorker\.register\(/);
    // The word appears in the comment explaining why it is not used, so this
    // has to look for the listener rather than the mention.
    expect(update).not.toMatch(/addEventListener\(\s*['"]controllerchange/);
    // The one reload lives in applyUpdate, which the user asks for by name.
    const registration = update.slice(update.indexOf('function registerWorker'));
    expect(registration).not.toMatch(/location\.reload/);
  });
});

describe('service worker', () => {
  it('takes its version from the ?v= it was registered with', () => {
    expect(worker).toMatch(/searchParams\.get\('v'\)/);
    expect(worker).toMatch(/const CACHE = `quickcorn2-\$\{APP_VERSION\}`/);
  });

  it('is registered with the version in the URL, which is what forces an update', () => {
    // The worker file is byte identical between releases, so a changing script
    // URL is the only thing that makes the browser install the new one.
    expect(update).toMatch(/register\(`\.\/sw\.js\?v=\$\{[^`]+\}`/);
    expect(update).toMatch(/updateViaCache:\s*'none'/);
  });

  it('carries no version literal of its own to fall out of step', () => {
    expect(worker).not.toMatch(/\d{4}\.\d{2}\.\d{2}\.\d{2}/);
  });

  it('serves everything network first so a stale copy cannot pin the app', () => {
    expect(worker).toMatch(/fetch\(request,\s*\{\s*cache:\s*'no-store'\s*\}\)/);
    // No cache-first branch at all: several modules mean a stale one paired with
    // a fresh page would be worse than the single file this replaced.
    const fetchHandler = worker.slice(worker.indexOf("addEventListener('fetch'"));
    expect(fetchHandler).not.toMatch(/cache\.match\(request\)\s*\|\|\s*await\s+caches\.match\(request\)\s*;\s*if\s*\(cached\)\s*return\s+cached\s*;\s*const\s+network/);
  });

  it('precaches nothing, so no hand-written shell list can go stale', () => {
    expect(worker).not.toMatch(/cache\.addAll/);
    expect(worker).not.toMatch(/APP_SHELL/);
  });
});
