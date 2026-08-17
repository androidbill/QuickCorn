import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Layout contracts for the game screen.
 *
 * These exist because of a real bug: IN/ON keys carry two lines of text where
 * Total keys carry one, so the pads are taller in that mode. With the round
 * strip as the flexible row, the extra height pushed the submit button off the
 * bottom of the screen in one mode and not the other. A DOM test cannot catch
 * that - happy-dom does not lay anything out - so the contract is asserted
 * against the stylesheet instead.
 */
const css = readFileSync(resolve(process.cwd(), 'app.css'), 'utf8');
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function ruleBody(selector) {
  const escaped = selector.replace(/[.#*]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : null;
}

describe('game screen rows', () => {
  it('has one row per section, in markup order', () => {
    const order = [...html.matchAll(/<div class="(teams|scores|nextup|pads|rounds)[" ]/g)].map((m) => m[1]);
    expect(order).toEqual(['teams', 'scores', 'nextup', 'pads', 'rounds']);
  });

  it('makes the pads the flexible row and leaves the rest to their content', () => {
    const rows = ruleBody('#screen-game').match(/grid-template-rows:\s*([^;]+);/)[1].trim();
    // teams, scores, nextup, PADS, rounds
    expect(rows).toBe('auto auto auto minmax(0, 1fr) auto');
  });

  it('keeps the submit button clear of the home indicator', () => {
    const padding = ruleBody('#screen-game').match(/padding-bottom:\s*([^;]+);/);
    expect(padding, 'no padding-bottom on #screen-game').toBeTruthy();
    expect(padding[1]).toMatch(/^max\(/);
    expect(padding[1]).toContain('safe-area-inset-bottom');
  });
});

describe('the round strip scrolls instead of stretching the screen', () => {
  it('lets the strip and its row shrink below their content width', () => {
    // A grid item's min-width is auto, so without these the strip held the whole
    // column open at the combined width of its chips - around round seven that
    // came to 574px on a 375px screen and carried the right team's score and pad
    // off the edge. Not catchable in happy-dom, which lays nothing out.
    expect(ruleBody('.rounds')).toMatch(/min-width:\s*0/);
    expect(ruleBody('.rounds-strip')).toMatch(/min-width:\s*0/);
  });

  it('scrolls the strip itself horizontally', () => {
    expect(ruleBody('.rounds-strip')).toMatch(/overflow-x:\s*auto/);
    // Chips keep their size and go off the end, rather than squeezing thinner
    // and thinner as the game runs long.
    expect(ruleBody('.round-chip')).toMatch(/flex:\s*0 0 auto/);
  });
});

describe('entry pads absorb the mode change', () => {
  it('lets the pad and its grid shrink rather than push', () => {
    expect(ruleBody('.pads')).toMatch(/min-height:\s*0/);
    const pad = ruleBody('.pad');
    expect(pad).toMatch(/min-height:\s*0/);
    expect(pad).toMatch(/grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  });

  it('shares the pad height equally between key rows', () => {
    const grid = ruleBody('.pad-grid');
    expect(grid).toMatch(/height:\s*100%/);
    expect(grid).toMatch(/grid-auto-rows:\s*minmax\(0, 1fr\)/);
  });

  it('lets a key shrink and clip rather than grow the pad', () => {
    const key = ruleBody('.key');
    expect(key).toMatch(/min-height:\s*0/);
    expect(key).toMatch(/overflow:\s*hidden/);
  });

  it('gives both modes the same number of key rows', () => {
    // 8 keys over 2 columns and 12 over 3 both come to four rows, so the grid
    // geometry does not change when the mode does.
    const aclColumns = ruleBody('.pad-grid--acl').match(/grid-template-columns:\s*([^;]+);/)[1];
    const totalColumns = ruleBody('.pad-grid--total').match(/grid-template-columns:\s*([^;]+);/)[1];
    const aclCols = aclColumns.trim().split(/\s+/).length;
    const totalCols = Number(totalColumns.match(/repeat\((\d+)/)[1]);
    expect(8 / aclCols).toBe(4);
    expect(12 / totalCols).toBe(4);
  });

  it('sizes the IN/ON number smaller, since that key also carries a label', () => {
    expect(css).toMatch(/\.pad-grid--acl \.key-num\s*\{\s*font-size:\s*var\(--fs-entry-num-acl\)/);
    for (const token of ['--fs-entry-num-acl']) {
      const declarations = [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, 'g'))];
      // One default and one phone override.
      expect(declarations.length).toBe(2);
    }
  });
});
