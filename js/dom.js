/** Small DOM helpers. Not a framework - just the three things used everywhere. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Tagged template that escapes interpolations. Use html`<p>${userName}</p>`. */
export function html(strings, ...values) {
  return strings.reduce((out, str, i) => {
    if (i === 0) return str;
    const value = values[i - 1];
    const text = value && value.__raw ? value.value : escapeHtml(value ?? '');
    return out + text + str;
  });
}

/** Mark a string as already-safe markup for interpolation into html``. */
export const raw = (value) => ({ __raw: true, value });

/** Set textContent only when it differs, so the browser skips needless work. */
export function setText(node, text) {
  const value = String(text);
  if (node && node.textContent !== value) node.textContent = value;
}

/** Replace innerHTML only when it differs. */
export function setHtml(node, markup) {
  if (node && node.innerHTML !== markup) node.innerHTML = markup;
}

export function toggleClass(node, name, on) {
  if (node) node.classList.toggle(name, Boolean(on));
}

/** Delegate an event from a container to the nearest matching ancestor. */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

export const safeText = (value, fallback = '') => String(value ?? '').trim() || fallback;

export function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

export function formatDateTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}
