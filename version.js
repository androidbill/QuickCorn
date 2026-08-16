/*
 * The single source of truth for the QuickCorn version.
 * Bump this one string on every change - nothing else carries a version.
 *
 * Format: YYYY.MM.DD.NN
 *
 * It reaches the rest of the app like this:
 *   index.html        loads this file, shows the version and registers the
 *                     service worker as ./service-worker.js?v=<version>
 *   service-worker.js reads that ?v= off its own URL, so a bump gives it a new
 *                     script URL and a new cache name without editing it
 */
self.APP_VERSION = '2026.08.15.08';
