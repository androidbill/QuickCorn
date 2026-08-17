/**
 * @vitest-environment happy-dom
 *
 * Boots QuickCorn exactly as a browser would: real index.html into a real
 * DOM, then the real entry module. An init-time error here is the difference
 * between a working app and a blank screen on a phone, and static checks cannot
 * catch it - so it is a test rather than something to remember to try.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll, vi } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
// Taken from the page rather than restated, so a version bump is not a chore
// here and the assertions below cannot drift from what ships.
const VERSION = html.match(/window\.APP_VERSION\s*=\s*'([^']+)'/)[1];

const errors = [];

beforeAll(async () => {
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  window.APP_VERSION = VERSION;

  // The update watch polls the network; give it the running version so it
  // decides there is nothing new rather than prompting during the test.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    text: async () => `window.APP_VERSION = '${VERSION}';`,
  })));

  window.addEventListener('error', (e) => errors.push(e.message));
  window.onunhandledrejection = (e) => errors.push(String(e.reason));

  await import('../js/app.js');
  // Let the update check settle.
  await new Promise((r) => setTimeout(r, 0));
});

describe('boot', () => {
  it('starts without throwing', () => {
    expect(errors).toEqual([]);
  });

  it('shows the version in the header and the About box', () => {
    expect(document.querySelector('#brand-version').textContent).toBe(`v${VERSION}`);
    expect(document.querySelector('#about-version').textContent).toContain(VERSION);
  });

  it('renders a fresh scoreboard at nil all', () => {
    expect(document.querySelector('#score-left').textContent).toBe('0');
    expect(document.querySelector('#score-right').textContent).toBe('0');
    expect(document.querySelector('#nextup-name').textContent).toBe('No points yet');
  });

  it('opens with a chip for round 1 rather than an empty strip', () => {
    // The strip used to render only scored rounds, so it had no height until the
    // first submit - at which point a chip appeared and every row above it moved.
    const chips = document.querySelectorAll('#rounds-strip .round-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].querySelector('.round-no').textContent).toBe('R1');
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
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

describe('editing names by tapping the scoreboard', () => {
  it('opens Edit Teams focused on the player that was tapped', () => {
    document.querySelector('[data-edit="right-0"]').click();
    expect(document.querySelector('#modal-teams').hidden).toBe(false);
    expect(document.activeElement.id).toBe('in-right-1');
    document.querySelector('#modal-teams [data-dismiss]').click();
  });

  it('reaches the second player of a team too', () => {
    document.querySelector('[data-edit="left-1"]').click();
    expect(document.activeElement.id).toBe('in-left-2');
    document.querySelector('#modal-teams [data-dismiss]').click();
  });

  it('leaves the caret collapsed rather than selecting the name', () => {
    document.querySelector('[data-edit="right-0"]').click();
    const input = document.querySelector('#in-right-1');
    // Only that nothing is highlighted can be checked here: happy-dom empties an
    // input when it takes focus, so the caret cannot be observed sitting at the
    // end of a real name. The position itself is pinned in layout.test.js
    // against the source, and was confirmed in a browser.
    expect(input.selectionStart).toBe(input.selectionEnd);
    document.querySelector('#modal-teams [data-dismiss]').click();
  });

  it('renames a player and shows it on the scoreboard', () => {
    document.querySelector('[data-edit="left-0"]').click();
    const input = document.querySelector('#in-left-1');
    input.value = 'Bill';
    document.querySelector('#save-teams').click();

    expect(document.querySelector('#modal-teams').hidden).toBe(true);
    expect(document.querySelector('[data-name="left-1"]').textContent).toBe('Bill');
    expect(document.querySelector('#pad-label-left').textContent).toContain('BILL');
  });
});

describe('team colours', () => {
  it('opens with the left team selected and its colour shown', () => {
    document.querySelector('[data-menu="colors"]').click();
    expect(document.querySelector('#modal-colors').hidden).toBe(false);
    expect(document.querySelector('[data-color-side="left"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#color-hex').textContent).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('falls back to the native picker when the wheel library is absent', () => {
    // happy-dom loads no scripts, so `iro` is undefined here - the same path a
    // phone takes if the library fails to load. The modal must still work.
    expect(document.querySelector('#color-fallback').hidden).toBe(false);
  });

  it('switches which team the picker is editing', () => {
    document.querySelector('[data-color-side="right"]').click();
    expect(document.querySelector('[data-color-side="right"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-color-side="left"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies a preset to the selected team only', () => {
    const before = document.documentElement.style.getPropertyValue('--team-left');
    document.querySelector('[data-preset="#6abf45"]').click();
    expect(document.documentElement.style.getPropertyValue('--team-right')).toBe('#6abf45');
    expect(document.documentElement.style.getPropertyValue('--team-left')).toBe(before);
  });

  it('resets both teams to the defaults', () => {
    document.querySelector('#reset-colors').click();
    expect(document.documentElement.style.getPropertyValue('--team-left')).toBe('#2a9fd6');
    expect(document.documentElement.style.getPropertyValue('--team-right')).toBe('#ba55d3');
    document.querySelector('#modal-colors [data-dismiss]').click();
  });

  it('opens the picker on the right team from the palette by its name', () => {
    document.querySelector('[data-color-btn="right"]').click();
    expect(document.querySelector('#modal-colors').hidden).toBe(false);
    expect(document.querySelector('[data-color-side="right"]').getAttribute('aria-pressed')).toBe('true');
    document.querySelector('#modal-colors [data-dismiss]').click();
  });

  it('opens it on the left team from the other palette', () => {
    document.querySelector('[data-color-btn="left"]').click();
    expect(document.querySelector('[data-color-side="left"]').getAttribute('aria-pressed')).toBe('true');
    document.querySelector('#modal-colors [data-dismiss]').click();
  });

  it('has no lane control left beside the names', () => {
    // The L/R lane tracker that used to sit here is gone; the palette took its
    // slot. Asserted so it does not come back with a copied-over block.
    expect(document.querySelectorAll('[data-lane]').length).toBe(0);
  });
});

describe('scoring a round through the UI', () => {
  it('records points and advances the round', () => {
    // Left team: one bag in the hole.
    document.querySelector('#pad-left [data-kind="in"][data-value="1"]').click();
    document.querySelector('#submit-btn').click();

    expect(document.querySelector('#score-left').textContent).toBe('3');
    expect(document.querySelector('#score-right').textContent).toBe('0');
    // R1 scored, plus the chip for R2 now in play.
    expect(document.querySelectorAll('#rounds-strip .round-chip').length).toBe(2);
    expect(document.querySelector('#rounds-strip .round-chip--now .round-no').textContent).toBe('R2');
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
    // The game is over, so there is no next round to offer a chip for.
    expect(document.querySelector('#rounds-strip .round-chip--now')).toBe(null);
  });

  it('starts a fresh game from the win screen', () => {
    document.querySelector('#play-again').click();
    expect(document.querySelector('#modal-win').hidden).toBe(true);
    expect(document.querySelector('#score-left').textContent).toBe('0');
    // Not an empty strip: a fresh game shows the chip for R1 waiting to be thrown.
    const chips = document.querySelectorAll('#rounds-strip .round-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].classList.contains('round-chip--now')).toBe(true);
    expect(chips[0].querySelector('.round-no').textContent).toBe('R1');
  });
});

describe('the About box', () => {
  it('reads icon, name, version, then author', () => {
    document.querySelector('[data-menu="about"]').click();
    expect(document.querySelector('#modal-about').hidden).toBe(false);

    const modal = document.querySelector('#modal-about .modal--about');
    // Order is the point, so assert the sequence rather than mere presence.
    const order = [...modal.children]
      .filter((el) => !el.classList.contains('modal-actions'))
      .map((el) => el.className || el.tagName.toLowerCase());
    expect(order).toEqual(['about-icon', 'h2', 'sub', 'about-author', 'about-blurb']);
  });

  it('shows the app icon, and hides it from the screen reader as decoration', () => {
    const icon = document.querySelector('#modal-about .about-icon');
    expect(icon.tagName).toBe('IMG');
    expect(icon.getAttribute('src')).toBe('./quickcorn-icon.svg');
    // The name is right underneath as real text, so alt would only repeat it.
    expect(icon.getAttribute('alt')).toBe('');
  });

  it('names the app, the running version and the author', () => {
    const modal = document.querySelector('#modal-about .modal--about');
    expect(modal.querySelector('h2').textContent).toBe('QuickCorn');
    expect(modal.querySelector('#about-version').textContent).toBe(`Version ${VERSION}`);
    expect(modal.querySelector('.about-author').textContent).toBe('Created by: Bill Parsons');
    document.querySelector('#modal-about [data-dismiss]').click();
    expect(document.querySelector('#modal-about').hidden).toBe(true);
  });
});

describe('the chip for the round in play', () => {
  const strip = () => [...document.querySelectorAll('#rounds-strip .round-chip')];
  const now = () => document.querySelector('#rounds-strip .round-chip--now');

  it('fills in on submit and hands off to the next round', () => {
    // Starts on a fresh game, left over from the play-again test above.
    expect(now().querySelector('.round-no').textContent).toBe('R1');

    document.querySelector('#pad-left [data-value="5"]').click();
    document.querySelector('#submit-btn').click();

    const chips = strip();
    expect(chips.length).toBe(2);
    // R1 is a scored chip now, carrying the running total.
    expect(chips[0].classList.contains('round-chip--now')).toBe(false);
    expect(chips[0].querySelector('.round-left').textContent).toBe('5');
    // ...and R2 has taken over as the one in play.
    expect(chips[1]).toBe(now());
    expect(now().querySelector('.round-no').textContent).toBe('R2');
  });

  it('holds no score of its own until it is thrown', () => {
    expect(now().querySelector('.round-left').textContent).toBe('–');
    expect(now().querySelector('.round-right').textContent).toBe('–');
  });

  it('gives up the selection when an earlier round is opened for editing', () => {
    strip()[0].click();
    expect(document.querySelector('[data-round="0"]').getAttribute('aria-pressed')).toBe('true');
    expect(now().getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#submit-btn').textContent).toBe('UPDATE');
  });

  it('comes back to the round in play when tapped', () => {
    now().click();
    expect(now().getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-round="0"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#submit-btn').textContent).toBe('SUBMIT');
  });

  it('keeps the taps already made when tapped while it is the one in play', () => {
    document.querySelector('#pad-left [data-value="7"]').click();
    now().click();
    document.querySelector('#submit-btn').click();
    // 5 from R1 and 7 from R2: the tap survived, so nothing was thrown away.
    expect(document.querySelector('#score-left').textContent).toBe('12');
  });
});
