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
const app = readFileSync(resolve(process.cwd(), 'js/app.js'), 'utf8');

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

describe('tapping a name to edit it', () => {
  // happy-dom empties an input the moment it takes focus, so where the caret
  // lands cannot be observed in a DOM test. Asserted against the source here for
  // the same reason the layout contracts above are.
  const fn = app.slice(app.indexOf('function focusAtEnd'));
  const body = fn.slice(0, fn.indexOf('\n}'));

  it('places the caret at the end of the name', () => {
    expect(body).toMatch(/setSelectionRange\(end,\s*end\)/);
    expect(body).toMatch(/const end = input\.value\.length/);
  });

  it('does not select the name, which one keypress would wipe', () => {
    expect(body).not.toMatch(/\.select\(\)/);
    expect(app.slice(app.indexOf("'[data-edit]'"))).not.toMatch(/\.select\(\)/);
  });

  it('collapses again after the keyboard opens, which re-selects on Android', () => {
    // A single synchronous call is not enough: Chrome on Android selects the
    // whole value as it raises the keyboard, after that call has run.
    expect(body).toMatch(/requestAnimationFrame\(collapse\)/);
    expect(body).toMatch(/for \(const delay of CARET_RETRIES_MS\) setTimeout\(collapse, delay\)/);
  });

  it('keeps retrying past the keyboard, and stops well before a deliberate selection', () => {
    const retries = app.match(/const CARET_RETRIES_MS = \[([^\]]+)\]/)[1].split(',').map((n) => Number(n.trim()));
    expect(retries.length).toBeGreaterThanOrEqual(2);
    // Long enough to outlast the keyboard animation, short enough that a
    // selection the user makes on purpose is never undone.
    expect(Math.max(...retries)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...retries)).toBeLessThan(600);
  });
});

describe('the shell matches the height that is actually on screen', () => {
  // The app is one fixed-height screen with no scroll, so a shell taller than
  // the visible area does not clip gracefully - it puts the bottom row, which
  // is the submit button, below the fold. This happened on a real phone where
  // 100dvh came back including the area behind the system bars.
  it('drives the height from a variable, with viewport units as the fallback', () => {
    for (const selector of ['html, body', '#app']) {
      const rule = ruleBody(selector);
      expect(rule, `no rule for ${selector}`).toBeTruthy();
      expect(rule).toMatch(/height:\s*var\(--app-height,\s*100svh\)/);
      // The plain declaration first, for anything without svh or custom props.
      expect(rule).toMatch(/height:\s*100dvh/);
      expect(rule.indexOf('100dvh')).toBeLessThan(rule.indexOf('--app-height'));
    }
  });

  it('sets that variable from the visible height at runtime', () => {
    const fn = app.slice(app.indexOf('function trackViewportHeight'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/setProperty\('--app-height'/);
    expect(body).toMatch(/visibleHeight\(\)/);
    expect(body).toMatch(/addEventListener\('resize'/);
    expect(body).toMatch(/addEventListener\('orientationchange'/);
    // A resize with a field focused is the keyboard, and resizing to fit above
    // it would squash the board.
    expect(body).toMatch(/activeElement\?\.tagName === 'INPUT'/);
    expect(app).toMatch(/function init\(\) \{\s*\n\s*trackViewportHeight\(\);/);
  });

  it('takes the smaller of innerHeight and visualViewport', () => {
    // innerHeight can include the area behind system bars; visualViewport is
    // what is genuinely on screen. Neither alone has proved reliable.
    const fn = app.slice(app.indexOf('export function visibleHeight'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/window\.innerHeight/);
    expect(body).toMatch(/window\.visualViewport\?\.height/);
    expect(body).toMatch(/Math\.min\(inner, visual\)/);
  });

  it('keeps the diagnostic off a normal load', () => {
    // Dynamically imported, so the file is never fetched unless it is asked for.
    expect(app).toMatch(/import\('\.\/diag\.js'\)/);
    expect(app).toMatch(/URLSearchParams\(location\.search\)\.has\('diag'\)/);
    expect(app).not.toMatch(/^import .*diag\.js/m);
  });

  it('can reach the diagnostic from inside the installed app', () => {
    // The home screen icon starts at its own start_url, so a ?diag=1 link never
    // reaches the case that is actually broken. The version line is the way in.
    expect(app).toMatch(/\$\('#brand-version'\)\.addEventListener\('click', openDiagnostics\)/);
  });

  it('leaves room for the status bar once installed', () => {
    // viewport-fit=cover means the viewport covers the whole screen in
    // standalone, and the status bar sits over the top of it.
    expect(ruleBody('.header')).toMatch(/padding-top:\s*max\(var\(--gap-2\), env\(safe-area-inset-top\)\)/);
    expect(ruleBody('#screen-game')).toMatch(/padding-bottom:\s*max\(.*safe-area-inset-bottom/);
    expect(html).toMatch(/viewport-fit=cover/);
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
