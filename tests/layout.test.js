import { describe, it, expect } from 'vitest';
import { loadStylesheet, parseDeclarations, resolve, computedPx } from './css-cascade.js';

// A snapshot of what the stylesheet actually resolves to at real device sizes.
//
// QuickCorn's type sizes are tuned by eye on a phone, across overlapping width
// and height media queries, and the same selector is often set more than once
// at the same breakpoint where only the last wins. That makes the stylesheet
// easy to change by accident. These expectations are the guard: touch the CSS
// and any size that moves shows up here as a diff to approve or reject, rather
// than as a surprise on the phone.
const declarations = parseDeclarations(loadStylesheet(new URL('../index.html', import.meta.url)));

const DEVICES = {
  'small phone 360x640': { width: 360, height: 640 },
  'phone short 390x760': { width: 390, height: 760 },
  'phone tall 390x844': { width: 390, height: 844 },
  'phone large 430x932': { width: 430, height: 932 },
  'tablet 768x1024': { width: 768, height: 1024 },
};

const TYPE_SELECTORS = [
  '.brand-title',
  '.brand-sub',
  '.score-box',
  '.team-player',
  '.team-player2',
  '.last-point-label',
  '.last-point-name',
  '.last-point-value',
  '.entry-btn-num',
  '.entry-btn-kind',
  '.entry-label',
  '.round-chip-score',
  '.round-chip-head',
  '.primary-btn',
  '.section-title',
  '.stat-value',
  '.stat-label',
];

// Snapshots hold rendered pixels, not declaration text, so the stylesheet can
// be restructured and still be shown to render the same. A diff here is a real
// visual change.
describe('type scale', () => {
  for (const [name, viewport] of Object.entries(DEVICES)) {
    it(`renders at the expected sizes on ${name}`, () => {
      const sizes = {};
      for (const selector of TYPE_SELECTORS) {
        sizes[selector] = computedPx(declarations, selector, 'font-size', viewport);
      }
      expect(sizes).toMatchSnapshot();
    });
  }
});

// Spacing and grid are snapshotted as the declaration that wins, not as
// pixels: several of these are not lengths at all (grid-template-rows), and
// this guard exists to catch a stray deletion rather than a rescale.
const LAYOUT_PAIRS = [
  ['.header', 'padding'], ['.header', 'min-height'],
  ['#game-screen', 'grid-template-rows'], ['#game-screen', 'gap'], ['#game-screen', 'padding'],
  ['#game-history-screen', 'padding'], ['#four-baggers-screen', 'padding'], ['#players-screen', 'padding'],
  ['.scoreboards', 'gap'],
  ['.team-card', 'padding'], ['.team-card', 'border-radius'], ['.team-card', 'min-height'],
  ['.team-player', 'line-height'], ['.team-player2', 'line-height'],
  ['.mini-btn', 'min-width'], ['.mini-btn', 'height'],
  ['.score-boxes', 'gap'],
  ['.score-box', 'min-height'], ['.score-box', 'border-radius'], ['.score-box', 'padding'],
  ['.last-point-card', 'grid-template-columns'], ['.last-point-card', 'grid-template-rows'],
  ['.last-point-card', 'column-gap'], ['.last-point-card', 'row-gap'],
  ['.last-point-card', 'min-height'], ['.last-point-card', 'padding'], ['.last-point-card', 'border-radius'],
  ['.entry-card', 'gap'],
  ['.entry-panels', 'gap'],
  ['.entry-panel', 'border-radius'], ['.entry-panel', 'padding'], ['.entry-panel', 'gap'],
  ['.entry-grid', '--entry-btn-height'], ['.entry-grid', 'gap'],
  ['.entry-btn', 'min-height'], ['.entry-btn', 'border-radius'],
  ['.entry-mode', 'gap'], ['.entry-mode button', 'min-height'], ['.entry-mode button', 'border-radius'],
  ['.bottom-bar', 'grid-template-columns'], ['.bottom-bar', 'gap'], ['.bottom-bar', 'padding'],
  ['.bottom-bar', 'border-radius'], ['.bottom-bar', 'height'],
  ['.primary-btn', 'min-height'], ['.primary-btn', 'height'], ['.primary-btn', 'border-radius'],
  ['.history-card', 'border-radius'], ['.history-card', 'padding'], ['.history-card', 'min-height'],
  ['.history-card', 'height'], ['.history-card', 'gap'], ['.history-card', 'max-height'],
  ['.history-scroller', 'gap'], ['.history-scroller', 'height'], ['.history-scroller', 'min-height'],
  ['.round-chip', 'min-width'], ['.round-chip', 'border-radius'],
  ['.round-chip-head', 'padding'], ['.round-chip-score', 'padding'],
  ['.pill', 'min-height'], ['.pill', 'border-radius'], ['.pill', 'padding'],
  ['.modal', 'max-height'],
  ['.color-preview', 'min-height'], ['#iro-picker', 'min-height'],
  ['.icon-btn', 'height'], ['.icon-btn', 'border-radius'],
];

describe('spacing and grid', () => {
  for (const [name, viewport] of Object.entries(DEVICES)) {
    it(`resolves as expected on ${name}`, () => {
      const layout = {};
      for (const [selector, prop] of LAYOUT_PAIRS) {
        layout[`${selector} ${prop}`] = resolve(declarations, selector, prop, viewport);
      }
      expect(layout).toMatchSnapshot();
    });
  }
});

describe('cascade invariants', () => {
  it('gives every type selector a size on every device', () => {
    for (const [name, viewport] of Object.entries(DEVICES)) {
      for (const selector of TYPE_SELECTORS) {
        const value = resolve(declarations, selector, 'font-size', viewport);
        expect(value, `${selector} on ${name}`).toBeTruthy();
      }
    }
  });

  it('never renders type below 7px on any device', () => {
    for (const [name, viewport] of Object.entries(DEVICES)) {
      for (const selector of TYPE_SELECTORS) {
        const px = computedPx(declarations, selector, 'font-size', viewport);
        expect(px, `${selector} on ${name}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('keeps the app column capped so viewport units cannot outrun it', () => {
    // Type is sized in vw while #app is width-capped, so the cap is load
    // bearing: without it, wide screens would scale type off the column.
    const maxWidth = resolve(declarations, '#app', 'max-width', { width: 1200, height: 900 });
    expect(maxWidth).toBe('540px');
  });
});
