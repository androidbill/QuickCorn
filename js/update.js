/**
 * Update detection.
 *
 * Deliberately independent of the service worker lifecycle. QuickCorn 1 drove
 * its prompt from `updatefound` and then posted SKIP_WAITING to
 * `registration.waiting` - but the worker called skipWaiting() during install,
 * so it was never in the waiting state and the button did nothing, while
 * clients.claim() fired controllerchange and reloaded the page underneath it.
 * Two mechanisms racing, and the symptom was a version that would not move.
 *
 * Here the running version is compared with the one served, as strings. It
 * cannot race, and it works the same in every browser.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Read the version out of the served index.html. */
async function fetchLiveVersion() {
  // The timestamp defeats the HTTP cache and any cache-first worker a previous
  // build may have left on the device.
  const response = await fetch(`./index.html?ts=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const text = await response.text();
  const match = text.match(/window\.APP_VERSION\s*=\s*'([^']+)'/);
  return match ? match[1] : null;
}

/**
 * Take the update: drop every cache and worker, then reload entirely from the
 * network. Heavy handed on purpose - it is the one action the user explicitly
 * asked for, and it cannot leave a stale copy behind.
 */
export async function applyUpdate() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    /* clearing is best effort; reload regardless */
  }
  window.location.reload();
}

/**
 * Poll for a newer version and call `onUpdate(version)` once when found.
 * Checks on start, whenever the app returns to the foreground, and periodically
 * - the foreground check is the one that matters for an installed app.
 */
export function startUpdateWatch(runningVersion, onUpdate) {
  let announced = false;

  async function check() {
    if (announced) return;
    try {
      const live = await fetchLiveVersion();
      if (!live || live === runningVersion) return;
      announced = true;
      onUpdate(live);
    } catch {
      /* offline; the next check picks it up */
    }
  }

  check();
  setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });

  registerWorker(runningVersion);
}

function registerWorker(version) {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // The version in the URL is what makes the browser install a new worker:
    // sw.js is byte identical between releases, so a changing script URL is the
    // only signal it has. No controllerchange reload - see the note above.
    navigator.serviceWorker
      .register(`./sw.js?v=${version}`, { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  });
}
