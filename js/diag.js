/**
 * Field diagnostic, loaded only when the page is opened with ?diag=1.
 *
 * The submit button went missing on a real phone twice, and both times it was
 * diagnosed from a screenshot and inference rather than numbers, and both times
 * the fix was wrong. A desktop browser cannot reproduce it: the preview pane
 * runs hidden, so timers are throttled and system bars do not exist. This reads
 * the values off the device that is actually broken.
 *
 * Nothing here is fetched unless the parameter is present - app.js imports it
 * dynamically - so it costs a normal load nothing. Delete it once the layout is
 * settled.
 */

/** Resolve a CSS length by measuring a probe element, since there is no API for it. */
function probe(value) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;height:${value};pointer-events:none`;
  document.body.appendChild(el);
  const measured = el.getBoundingClientRect().height;
  el.remove();
  return Math.round(measured * 100) / 100;
}

function rect(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
}

function collect() {
  const vv = window.visualViewport;
  const submit = rect('#submit-btn');
  const visible = window.innerHeight;
  const display = ['standalone', 'fullscreen', 'minimal-ui', 'browser']
    .find((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) || 'unknown';
  return {
    version: window.APP_VERSION,
    displayMode: display,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    dpr: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    screenHeight: window.screen?.height,
    visualViewportH: vv ? Math.round(vv.height) : null,
    visualOffsetTop: vv ? Math.round(vv.offsetTop) : null,
    '100dvh': probe('100dvh'),
    '100svh': probe('100svh'),
    '100lvh': probe('100lvh'),
    safeTop: probe('env(safe-area-inset-top)'),
    safeBottom: probe('env(safe-area-inset-bottom)'),
    appHeightVar: getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim() || '(unset)',
    appBox: rect('#app'),
    headerBox: rect('.header'),
    screenBox: rect('#screen-game'),
    padsBox: rect('.pads'),
    roundsBox: rect('.rounds'),
    stripBox: rect('#rounds-strip'),
    submitBox: submit,
    SUBMIT_VISIBLE: submit ? (submit.bottom <= visible && submit.height > 0) : 'no element',
    submitOverflowPx: submit ? Math.round(submit.bottom - visible) : null,
  };
}

export function showDiagnostics() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999', 'background:#02121f', 'color:#dff0ff',
    'font:12px/1.45 ui-monospace,Menlo,Consolas,monospace', 'padding:10px',
    'overflow:auto', '-webkit-overflow-scrolling:touch',
  ].join(';');

  const render = () => {
    const data = collect();
    const rows = Object.entries(data).map(([key, value]) => {
      const text = value && typeof value === 'object' ? JSON.stringify(value) : String(value);
      const bad = (key === 'SUBMIT_VISIBLE' && value !== true) || (key === 'submitOverflowPx' && Number(value) > 0);
      const colour = bad ? '#ff6b6b' : key === 'SUBMIT_VISIBLE' ? '#6abf45' : '#dff0ff';
      return `<div style="display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #0e2537">
        <span style="flex:0 0 44%;color:#7fa8c4">${key}</span>
        <span style="flex:1;color:${colour};word-break:break-all">${text}</span>
      </div>`;
    });
    panel.innerHTML = `
      <div style="font-size:14px;font-weight:900;margin-bottom:6px">QuickCorn layout diagnostic</div>
      <div style="color:#7fa8c4;margin-bottom:8px">Screenshot this whole screen and send it.</div>
      ${rows.join('')}
      <button id="diag-close" style="margin-top:12px;width:100%;min-height:44px;border-radius:10px;
        background:#123;color:#dff0ff;border:1px solid #2a4a63;font-weight:800">Close</button>`;
    panel.querySelector('#diag-close').addEventListener('click', () => panel.remove());
  };

  render();
  document.body.appendChild(panel);
}
