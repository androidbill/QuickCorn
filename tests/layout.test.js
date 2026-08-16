import { describe, it, expect } from 'vitest';
import { loadStylesheet, parseDeclarations, resolve } from './css-cascade.js';

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

describe('type scale', () => {
  for (const [name, viewport] of Object.entries(DEVICES)) {
    it(`resolves as expected on ${name}`, () => {
      const sizes = {};
      for (const selector of TYPE_SELECTORS) {
        sizes[selector] = resolve(declarations, selector, 'font-size', viewport);
      }
      expect(sizes).toMatchSnapshot();
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

  it('never renders body type below 7px on any device', () => {
    for (const viewport of Object.values(DEVICES)) {
      for (const selector of TYPE_SELECTORS) {
        const value = resolve(declarations, selector, 'font-size', viewport);
        const px = /^(\d+)px$/.exec(value || '');
        if (px) expect(Number(px[1])).toBeGreaterThanOrEqual(7);
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
