/**
 * @vitest-environment happy-dom
 *
 * Boots QuickCorn 2 exactly as a browser would: real index.html into a real
 * DOM, then the real entry module. An init-time error here is the difference
 * between a working app and a blank screen on a phone, and static checks cannot
 * catch it - so it is a test rather than something to remember to try.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, vi } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'test/index.html'), 'utf8');

const errors = [];

beforeAll(async () => {
  // The page is served from /test/, so relative fetches resolve against it.
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  window.APP_VERSION = '2026.08.16.01';

  // The update watch polls the network; give it the running version so it
  // decides there is nothing new rather than prompting during the test.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    text: async () => `window.APP_VERSION = '2026.08.16.01';`,
  })));

  window.addEventListener('error', (e) => errors.push(e.message));
  window.onunhandledrejection = (e) => errors.push(String(e.reason));

  await import('../test/js/app.js');
  // Let the update check settle.
  await new Promise((r) => setTimeout(r, 0));
});

describe('boot', () => {
  it('starts without throwing', () => {
    expect(errors).toEqual([]);
  });

  it('shows the version in the header and the About box', () => {
    expect(document.querySelector('#brand-version').textContent).toBe('v2026.08.16.01');
    expect(document.querySelector('#about-version').textContent).toContain('2026.08.16.01');
  });

  it('renders a fresh scoreboard at nil all', () => {
    expect(document.querySelector('#score-left').textContent).toBe('0');
    expect(document.querySelector('#score-right').textContent).toBe('0');
    expect(document.querySelector('#nextup-name').textContent).toBe('No points yet');
  });

  it('shows the game screen and hides the others', () => {
    expect(document.querySelector('#screen-game').hidden).toBe(false);
    for (const id of ['#screen-history', '#screen-baggers', '#screen-players']) {
      expect(document.querySelector(id).hidden, id).toBe(true);
    }
  });

  it('builds both entry pads with the IN/ON keys', () => {
    const keys = document.querySelectorAll('#pad-left .key');
    expect(keys.length).toBe(8); // 1-4 IN and 1-4 ON
    expect(document.querySelectorAll('#pad-right .key').length).toBe(8);
  });

  it('names both teams on the pads', () => {
    expect(document.querySelector('#pad-label-left').textContent).toBeTruthy();
    expect(document.querySelector('#pad-label-right').textContent).toBeTruthy();
  });

  it('applies the team colours as custom properties', () => {
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--team-left')).toBeTruthy();
    expect(root.getPropertyValue('--team-right')).toBeTruthy();
  });

  it('opens and closes the menu', () => {
    const menu = document.querySelector('#menu');
    expect(menu.hidden).toBe(true);
    document.querySelector('#menu-btn').click();
    expect(menu.hidden).toBe(false);
  });

  it('starts with every modal closed', () => {
    for (const modal of document.querySelectorAll('.modal-wrap')) {
      expect(modal.hidden, modal.id).toBe(true);
    }
  });
});

describe('scoring a round through the UI', () => {
  it('records points and advances the round', () => {
    // Left team: one bag in the hole.
    document.querySelector('#pad-left [data-kind="in"][data-value="1"]').click();
    document.querySelector('#submit-btn').click();

    expect(document.querySelector('#score-left').textContent).toBe('3');
    expect(document.querySelector('#score-right').textContent).toBe('0');
    expect(document.querySelectorAll('#rounds-strip .round-chip').length).toBe(1);
    expect(document.querySelector('#nextup-value').textContent).toBe('+3 R1');
  });

  it('cancels so only the difference counts', () => {
    document.querySelector('#pad-left [data-kind="in"][data-value="1"]').click();
    document.querySelector('#pad-right [data-kind="on"][data-value="2"]').click();
    document.querySelector('#submit-btn').click();

    // 3 against 2 leaves 1 to the left team, on top of the 3 already scored.
    expect(document.querySelector('#score-left').textContent).toBe('4');
    expect(document.querySelector('#score-right').textContent).toBe('0');
  });

  it('switches the pads to Total mode', () => {
    document.querySelector('[data-scoring="total"]').click();
    const keys = document.querySelectorAll('#pad-left .key');
    expect(keys.length).toBe(12); // TOTAL_VALUES
    expect(document.querySelector('[data-scoring="total"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('records an unambiguous total without prompting', () => {
    document.querySelector('#pad-left [data-value="9"]').click();
    expect(document.querySelector('#modal-breakdown').hidden).toBe(true);
    document.querySelector('#submit-btn').click();
    expect(document.querySelector('#score-left').textContent).toBe('13');
  });

  it('does not prompt for an ambiguous total while Track IN/ON is off', () => {
    document.querySelector('#pad-left [data-value="6"]').click();
    expect(document.querySelector('#modal-breakdown').hidden).toBe(true);
    document.querySelector('#submit-btn').click();
    expect(document.querySelector('#score-left').textContent).toBe('19');
  });

  it('prompts for an ambiguous total once Track IN/ON is on', () => {
    document.querySelector('#track-toggle').click();
    expect(document.querySelector('#track-toggle').getAttribute('aria-checked')).toBe('true');

    document.querySelector('#pad-left [data-value="6"]').click();
    const modal = document.querySelector('#modal-breakdown');
    expect(modal.hidden).toBe(false);
    expect(document.querySelectorAll('#breakdown-choices .choice').length).toBe(2);

    document.querySelector('[data-breakdown="2-0"]').click();
    expect(modal.hidden).toBe(true);
  });

  it('declares a winner on reaching the target', () => {
    document.querySelector('#submit-btn').click(); // 19 + 6 = 25, past 21
    expect(document.querySelector('#modal-win').hidden).toBe(false);
    expect(document.querySelector('#win-score').textContent).toBe('25 - 0');
    expect(document.querySelectorAll('#win-stats .stat-grid').length).toBe(1);
  });

  it('starts a fresh game from the win screen', () => {
    document.querySelector('#play-again').click();
    expect(document.querySelector('#modal-win').hidden).toBe(true);
    expect(document.querySelector('#score-left').textContent).toBe('0');
    expect(document.querySelectorAll('#rounds-strip .round-chip').length).toBe(0);
  });
});
