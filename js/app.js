import * as R from './rules.js';
import { getState, setState, subscribe, resetGame, newGame, emptyEntry, flush, DEFAULT_COLORS } from './store.js';
import { $, $$, html, raw, setText, setHtml, toggleClass, on, safeText, escapeHtml, formatDate, formatDateTime } from './dom.js';
import { startUpdateWatch, applyUpdate } from './update.js';

const APP_VERSION = window.APP_VERSION || 'dev';
const TARGETS = [11, 15, 21];
const PRESETS = ['#2a9fd6', '#ba55d3', '#e8332a', '#1a6fe8', '#6abf45', '#f0a500', '#ff6b6b', '#14b8a6', '#f472b6', '#a78bfa', '#facc15', '#94a3b8'];

/* ------------------------------------------------------------------ theme */

function applyTheme(state) {
  const root = document.documentElement.style;
  root.setProperty('--team-left', state.teamColors.left);
  root.setProperty('--team-right', state.teamColors.right);
}

/* ------------------------------------------------------------- game screen */

const sideName = (state, side, index) =>
  safeText(state.teams[side].players[index], index === 0 ? 'Player 1' : 'Player 2');

function teamLabel(state, side) {
  const players = state.teams[side].players.filter(Boolean);
  if (state.mode === '1v1') return safeText(players[0], side === 'left' ? 'Left' : 'Right');
  return players.length ? players.join(' & ') : side === 'left' ? 'Left Team' : 'Right Team';
}

function renderTeams(state) {
  const roundIndex = state.game.editingRound ?? state.game.rounds.length;
  for (const side of R.SIDES) {
    const throwing = R.currentThrower(state.mode, state.firstShooter[side], roundIndex);
    const one = $(`[data-name="${side}-1"]`);
    const two = $(`[data-name="${side}-2"]`);
    setText(one, sideName(state, side, 0));
    setText(two, state.mode === '2v2' ? sideName(state, side, 1) : '');
    two.hidden = state.mode !== '2v2';

    const solo = state.mode === '1v1';
    toggleClass(one, 'is-throwing', !solo && throwing === 0);
    toggleClass(one, 'is-waiting', !solo && throwing !== 0);
    toggleClass(two, 'is-throwing', !solo && throwing === 1);
    toggleClass(two, 'is-waiting', !solo && throwing !== 1);
  }
}

function renderScores(state) {
  const totals = R.getTotals(state.game.rounds);
  setText($('#score-left'), totals.left);
  setText($('#score-right'), totals.right);
  const last = R.lastScoringRound(state.game.rounds);
  const winning = last ? (last.round.leftNet > 0 ? 'left' : 'right') : null;
  toggleClass($('#score-left'), 'is-latest', winning === 'left');
  toggleClass($('#score-right'), 'is-latest', winning === 'right');
}

function renderNextUp(state) {
  const card = $('#nextup');
  card.classList.remove('nextup--left', 'nextup--right');
  const last = R.lastScoringRound(state.game.rounds);
  if (!last) {
    setText($('#nextup-name'), 'No points yet');
    setText($('#nextup-value'), '0');
    return;
  }
  const side = last.round.leftNet > 0 ? 'left' : 'right';
  const points = side === 'left' ? last.round.leftNet : last.round.rightNet;
  card.classList.add(`nextup--${side}`);
  // Whoever scored last throws first next round.
  const nextIndex = state.game.editingRound ?? state.game.rounds.length;
  const player = R.currentThrower(state.mode, state.firstShooter[side], nextIndex);
  setText($('#nextup-name'), sideName(state, side, player));
  setText($('#nextup-value'), `+${points} R${last.index + 1}`);
}

function padMarkup(state, side) {
  const entry = state.game.currentEntry[side];
  if (state.scoringMode === 'acl') {
    const key = (kind, value) => html`
      <button class="key" data-pad="${side}" data-kind="${kind}" data-value="${value}"
        aria-pressed="${entry[kind] === value ? 'true' : 'false'}">
        <span class="key-num">${value}</span><span class="key-kind">${kind.toUpperCase()}</span>
      </button>`;
    const rows = [1, 2, 3, 4].map((v) => key('in', v) + key('on', v)).join('');
    return `<div class="pad-grid pad-grid--acl">${rows}</div>`;
  }
  const keys = R.TOTAL_VALUES.map(
    (v) => html`
      <button class="key" data-pad="${side}" data-kind="total" data-value="${v}"
        aria-pressed="${entry.total === v ? 'true' : 'false'}">
        <span class="key-num">${v}</span>
      </button>`
  ).join('');
  return `<div class="pad-grid pad-grid--total">${keys}</div>`;
}

function renderPads(state) {
  for (const side of R.SIDES) {
    setText($(`#pad-label-${side}`), teamLabel(state, side).toUpperCase());
    setHtml($(`#pad-${side}`), padMarkup(state, side));
  }
  for (const btn of $$('[data-scoring]')) {
    btn.setAttribute('aria-pressed', btn.dataset.scoring === state.scoringMode ? 'true' : 'false');
  }
}

function renderRounds(state) {
  let left = 0;
  let right = 0;
  const chips = state.game.rounds.map((round, i) => {
    left += round.leftNet;
    right += round.rightNet;
    const pressed = state.game.editingRound === i ? 'true' : 'false';
    return html`<button class="round-chip" data-round="${i}" aria-pressed="${pressed}">
      <span class="round-no">R${i + 1}</span>
      <span class="round-left">${left}</span>
      <span class="round-right">${right}</span>
    </button>`;
  });
  /* The round being entered gets a chip of its own, ahead of being scored. A new
     game used to open with an empty strip, so the row had no height and every
     box above it sat too tall until the first submit dropped a chip in and
     everything shifted. Now R1 is there from the start, submitting fills it in,
     and a fresh chip takes its place. A won game gets none - there is no next
     round to enter. */
  if (!R.getWinnerSide(state.game.rounds, state.game.targetScore)) {
    const next = state.game.rounds.length;
    const pressed = state.game.editingRound == null ? 'true' : 'false';
    chips.push(html`<button class="round-chip round-chip--now" data-round="${next}" aria-pressed="${pressed}">
      <span class="round-no">R${next + 1}</span>
      <span class="round-left">&ndash;</span>
      <span class="round-right">&ndash;</span>
    </button>`);
  }
  setHtml($('#rounds-strip'), chips.join(''));
  scrollCurrentChipIntoView();

  const entries = state.game.currentEntry;
  const valid = R.validateEntry(entries.left) && R.validateEntry(entries.right);
  $('#submit-btn').disabled = !valid;
  setText($('#submit-btn'), state.game.editingRound != null ? 'UPDATE' : 'SUBMIT');
  $('#clear-btn').hidden = state.game.editingRound == null && !hasEntry(state);
}

/* The strip is rebuilt whole, which resets its scroll to the left, so put the
   chip in play back in view. Past round eight it would otherwise sit off the
   right edge - showing the current round is the whole point of it. */
function scrollCurrentChipIntoView() {
  const strip = $('#rounds-strip');
  const chip = strip && $('[aria-pressed="true"]', strip);
  if (chip) strip.scrollLeft = chip.offsetLeft + chip.offsetWidth - strip.clientWidth;
}

const hasEntry = (state) =>
  R.SIDES.some((s) => {
    const e = state.game.currentEntry[s];
    return e.in || e.on || e.total != null;
  });

function renderGame(state) {
  renderTeams(state);
  renderScores(state);
  renderNextUp(state);
  renderPads(state);
  renderRounds(state);
}

/* ---------------------------------------------------------------- entries */

function setBag(side, kind, value) {
  setState((s) => {
    const entry = s.game.currentEntry[side];
    entry[kind] = entry[kind] === value ? 0 : value;
    entry.total = entry.in * R.IN_VALUE + entry.on * R.ON_VALUE;
  }, ['game']);
}

function setTotal(side, value) {
  const options = R.entryBreakdownOptions(value);
  if (options.length === 1) {
    setState((s) => { s.game.currentEntry[side] = { ...options[0], total: value }; }, ['game']);
    return;
  }
  if (!getState().trackInOn) {
    // Not tracking the split, so record the total and leave in/on at zero
    // rather than inventing a breakdown nobody asked for.
    setState((s) => { s.game.currentEntry[side] = { in: 0, on: 0, total: value }; }, ['game']);
    return;
  }
  openBreakdown(side, value, options);
}

function openBreakdown(side, total, options) {
  setText($('#breakdown-title'), `${teamLabel(getState(), side)} — ${total} points`);
  setHtml($('#breakdown-choices'), options.map((o) =>
    html`<button class="choice" data-breakdown="${o.in}-${o.on}">${o.in} IN, ${o.on} ON</button>`
  ).join(''));
  openModal('modal-breakdown');
  $('#breakdown-choices').dataset.side = side;
  $('#breakdown-choices').dataset.total = String(total);
}

function submitRound() {
  const state = getState();
  const { left, right } = state.game.currentEntry;
  if (!R.validateEntry(left) || !R.validateEntry(right)) return;

  const round = R.scoreRound(left, right, state.scoringMode);
  const index = state.game.editingRound ?? state.game.rounds.length;

  setState((s) => {
    if (s.game.editingRound != null) s.game.rounds[s.game.editingRound] = round;
    else s.game.rounds.push(round);
    s.game.editingRound = null;
    s.game.currentEntry = { left: emptyEntry(), right: emptyEntry() };
  }, ['game']);

  recordFourBaggers(round, index);

  if (R.getWinnerSide(getState().game.rounds, getState().game.targetScore)) {
    saveGameToHistory();
    openWinModal();
  }
}

function clearEntry() {
  setState((s) => {
    s.game.editingRound = null;
    s.game.currentEntry = { left: emptyEntry(), right: emptyEntry() };
  }, ['game']);
}

/**
 * Focus a text field with the caret after the last character, nothing selected.
 *
 * A name is nearly always being corrected rather than swapped for a different
 * one, so selecting it just puts it one keypress from gone.
 *
 * Collapsing the selection once is not enough on a phone. Chrome on Android
 * selects the whole value itself as it raises the keyboard, which happens after
 * a synchronous call has already run, so the field arrives highlighted anyway -
 * which a desktop browser does not do, and is why this looked fixed when it was
 * not.
 *
 * So it is collapsed again on the next frame and twice more while the keyboard
 * is arriving. Listening for the field's own `select` event would be tidier, but
 * a scripted setSelectionRange does not raise one, so there is nothing to hear.
 * The retries stop well before anyone could make a selection deliberately.
 */
const CARET_RETRIES_MS = [150, 350];

function focusAtEnd(input) {
  const collapse = () => {
    const end = input.value.length;
    try { input.setSelectionRange(end, end); } catch { /* not a field with a caret */ }
  };
  input.focus();
  collapse();
  requestAnimationFrame(collapse);
  for (const delay of CARET_RETRIES_MS) setTimeout(collapse, delay);
}

function selectRound(index) {
  setState((s) => {
    const pending = s.game.rounds[index] === undefined;
    if (pending) {
      // The chip for the round in play. Tapping it while editing an earlier
      // round comes back here; tapping it when already here leaves the taps
      // alone, since Clear is the button for throwing them away.
      if (s.game.editingRound == null) return;
      s.game.editingRound = null;
      s.game.currentEntry = { left: emptyEntry(), right: emptyEntry() };
      return;
    }
    if (s.game.editingRound === index) {
      s.game.editingRound = null;
      s.game.currentEntry = { left: emptyEntry(), right: emptyEntry() };
      return;
    }
    const round = s.game.rounds[index];
    s.game.editingRound = index;
    s.game.currentEntry = {
      left: { in: round.leftIn, on: round.leftOn, total: round.leftTotalRaw ?? round.leftGross },
      right: { in: round.rightIn, on: round.rightOn, total: round.rightTotalRaw ?? round.rightGross },
    };
  }, ['game']);
}

/* ----------------------------------------------------------- four baggers */

function recordFourBaggers(round, roundIndex) {
  const state = getState();
  const playedAt = new Date().toISOString();
  const prefix = `${state.game.sessionId}-${roundIndex}-`;
  const records = R.SIDES.flatMap((side) => {
    if (!R.isFourBaggerRound(round, side)) return [];
    const player = R.currentThrower(state.mode, state.firstShooter[side], roundIndex);
    return [{
      id: `${prefix}${side}`,
      sessionId: state.game.sessionId,
      roundNumber: roundIndex + 1,
      playedAt,
      side,
      playerName: sideName(state, side, player),
    }];
  });
  setState((s) => {
    // Re-entering an edited round replaces its records rather than duplicating.
    s.fourBaggers = s.fourBaggers.filter((e) => !String(e.id).startsWith(prefix));
    if (records.length) s.fourBaggers.unshift(...records);
  }, ['fourBaggers']);
}

/* -------------------------------------------------------------- game over */

function buildHistoryRecord() {
  const state = getState();
  const winner = R.getWinnerSide(state.game.rounds, state.game.targetScore);
  if (!winner) return null;
  const totals = R.getTotals(state.game.rounds);
  const existing = state.gameHistory.find((e) => e.id === state.game.historyEntryId);
  return {
    id: state.game.historyEntryId || `game-${Date.now()}`,
    playedAt: existing?.playedAt || new Date().toISOString(),
    winnerSide: winner,
    winnerTeam: teamLabel(state, winner),
    score: `${totals.left} - ${totals.right}`,
    targetScore: state.game.targetScore,
    stats: R.computePlayerStats(state.game.rounds, state.mode, state.teams, state.firstShooter)
      .map((row) => ({ ...row, color: state.teamColors[row.side] })),
  };
}

function saveGameToHistory() {
  const record = buildHistoryRecord();
  if (!record) return;
  setState((s) => {
    s.game.historyEntryId = record.id;
    const i = s.gameHistory.findIndex((e) => e.id === record.id);
    if (i >= 0) s.gameHistory[i] = record;
    else s.gameHistory.unshift(record);
  }, ['gameHistory']);
}

function statTable(stats) {
  const rows = stats.map((row) => html`
    <div><span class="dot" style="background:${row.color}"></span>${row.name}</div>
    <div class="num">${row.total}</div>
    <div class="num">${row.rounds}</div>
    <div class="num">${row.ppr}</div>`).join('');
  return `<div class="stat-grid">
      <div class="head">Player</div><div class="head num">Pts</div><div class="head num">Rds</div><div class="head num">PPR</div>
      ${rows}
    </div>`;
}

function openWinModal() {
  const state = getState();
  const winner = R.getWinnerSide(state.game.rounds, state.game.targetScore);
  const totals = R.getTotals(state.game.rounds);
  const banner = $('#win-banner');
  banner.className = `banner banner--${winner}`;
  setText($('#win-team'), `${teamLabel(state, winner)} wins`);
  setText($('#win-score'), `${totals.left} - ${totals.right}`);
  setHtml($('#win-stats'), statTable(R.computePlayerStats(state.game.rounds, state.mode, state.teams, state.firstShooter)
    .map((r) => ({ ...r, color: state.teamColors[r.side] }))));
  openModal('modal-win');
}

async function shareResult() {
  const state = getState();
  const totals = R.getTotals(state.game.rounds);
  const winner = R.getWinnerSide(state.game.rounds, state.game.targetScore);
  const stats = R.computePlayerStats(state.game.rounds, state.mode, state.teams, state.firstShooter);
  const lines = [
    `QuickCorn — ${teamLabel(state, winner)} wins`,
    `${teamLabel(state, 'left')} ${totals.left} – ${totals.right} ${teamLabel(state, 'right')}`,
    '',
    ...stats.map((s) => `${s.name}: ${s.ppr} PPR (${s.total} pts / ${s.rounds} rds)`),
  ];
  await shareText(lines.join('\n'));
}

async function shareText(text) {
  try {
    if (navigator.share) return void (await navigator.share({ title: 'QuickCorn', text }));
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', null);
  } catch {
    /* the user dismissed the sheet */
  }
}

/* ---------------------------------------------------------------- screens */

function showScreen(name) {
  setState((s) => { s.screen = name; }, ['screen']);
}

function renderScreens(state) {
  for (const section of $$('.screen')) {
    section.hidden = section.id !== `screen-${state.screen}`;
  }
  if (state.screen === 'history') renderHistory(state);
  if (state.screen === 'baggers') renderBaggers(state);
  if (state.screen === 'players') renderPlayers(state);
}

function renderHistory(state) {
  if (!state.gameHistory.length) {
    setHtml($('#history-list'), '<div class="empty">No finished games yet.</div>');
    return;
  }
  setHtml($('#history-list'), state.gameHistory.map((entry) => html`
    <div class="card">
      <div class="card-head">
        <div class="card-title">${entry.winnerTeam} won ${entry.score}</div>
        <button class="icon-action" data-delete-game="${entry.id}" aria-label="Delete game">&times;</button>
      </div>
      <div class="card-sub">${formatDateTime(entry.playedAt)} · to ${entry.targetScore ?? 21}</div>
      ${raw(statTable(entry.stats || []))}
    </div>`).join(''));
}

function renderBaggers(state) {
  const year = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Unknown' : String(d.getFullYear());
  };
  const records = [...state.fourBaggers].sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  const thisYear = String(new Date().getFullYear());
  const years = [...new Set([thisYear, ...records.map((r) => year(r.playedAt))])].sort((a, b) => Number(b) - Number(a));
  const selected = years.includes(state.ui.fourBaggerYear) ? state.ui.fourBaggerYear : thisYear;

  const select = $('#bagger-year');
  setHtml(select, years.map((y) => html`<option value="${y}">${y}</option>`).join(''));
  select.value = selected;

  const visible = records.filter((r) => year(r.playedAt) === selected);
  if (!visible.length) {
    setHtml($('#baggers-list'), `<div class="empty">No 4-baggers in ${escapeHtml(selected)} yet.</div>`);
    return;
  }
  const counts = visible.reduce((acc, r) => ({ ...acc, [r.playerName]: (acc[r.playerName] || 0) + 1 }), {});
  const leaderboard = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => html`
    <div class="row" style="margin-top:6px"><div>${name}</div><div class="num" style="font-weight:900">${count}</div></div>`).join('');

  const log = visible.map((r) => html`
    <div class="card">
      <div class="row">
        <div>
          <div class="card-title">${r.playerName}</div>
          <div class="card-sub">${formatDate(r.playedAt)} · round ${r.roundNumber}</div>
        </div>
        <button class="icon-action" data-delete-bagger="${r.id}" aria-label="Delete">&times;</button>
      </div>
    </div>`).join('');

  setHtml($('#baggers-list'), `<div class="card"><div class="card-title">${escapeHtml(selected)} — ${visible.length} total</div>${leaderboard}</div>${log}`);
}

function renderPlayers(state) {
  const names = state.playerHistory;
  if (!names.length) {
    setHtml($('#players-list'), '<div class="empty">No saved players yet.</div>');
    return;
  }
  setHtml($('#players-list'), names.map((name) => {
    const baggers = state.fourBaggers.filter((e) => e.playerName.toLowerCase() === name.toLowerCase()).length;
    return html`<div class="card">
      <div class="row">
        <div>
          <div class="card-title">${name}</div>
          <div class="card-sub">${baggers} 4-bagger${baggers === 1 ? '' : 's'}</div>
        </div>
        <button class="icon-action" data-rename="${name}" aria-label="Rename">&#9998;</button>
        <button class="icon-action" data-remove-player="${name}" aria-label="Remove">&times;</button>
      </div>
    </div>`;
  }).join(''));
}

/* ----------------------------------------------------------------- modals */

const openModal = (id) => { $(`#${id}`).hidden = false; };
const closeModal = (id) => { $(`#${id}`).hidden = true; };
const closeAllModals = () => $$('.modal-wrap').forEach((m) => { m.hidden = true; });

function uniqueNames(names) {
  const seen = new Set();
  return names
    .map((n) => String(n || '').trim())
    .filter((n) => n && !/^player\s*\d+$/i.test(n))
    .filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function openTeamsModal() {
  const state = getState();
  setState((s) => { s.ui.draftTeamMode = s.mode; }, []);
  $('#in-left-1').value = sideName(state, 'left', 0);
  $('#in-left-2').value = safeText(state.teams.left.players[1], 'Player 2');
  $('#in-right-1').value = state.mode === '1v1' ? safeText(state.teams.right.players[0], 'Player 2') : safeText(state.teams.right.players[0], 'Player 3');
  $('#in-right-2').value = safeText(state.teams.right.players[1], 'Player 4');
  setHtml($('#player-names'), state.playerHistory.map((n) => html`<option value="${n}"></option>`).join(''));
  syncTeamsModal();
  openModal('modal-teams');
}

function syncTeamsModal() {
  const solo = getState().ui.draftTeamMode === '1v1';
  $$('[data-team-mode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.teamMode === '1v1') === solo)));
  $$('[data-second-player]').forEach((f) => { f.hidden = solo; });
  $('#matchup-block').hidden = solo;
  const pair = Number(getState().firstShooter.left) || 0;
  const label = (i) => `${safeText($(`#in-left-${i + 1}`).value, `P${i + 1}`)} vs ${safeText($(`#in-right-${i + 1}`).value, `P${i + 3}`)}`;
  $$('[data-first-pair]').forEach((b) => {
    const index = Number(b.dataset.firstPair);
    setText(b, label(index));
    b.setAttribute('aria-pressed', String(index === pair));
  });
}

function saveTeams() {
  const draft = getState().ui.draftTeamMode;
  setState((s) => {
    s.mode = draft;
    s.teams.left.players[0] = safeText($('#in-left-1').value, 'Player 1');
    s.teams.right.players[0] = safeText($('#in-right-1').value, draft === '1v1' ? 'Player 2' : 'Player 3');
    if (draft === '2v2') {
      s.teams.left.players[1] = safeText($('#in-left-2').value, 'Player 2');
      s.teams.right.players[1] = safeText($('#in-right-2').value, 'Player 4');
    } else {
      s.teams.left.players[1] = '';
      s.teams.right.players[1] = '';
      s.firstShooter = { left: 0, right: 0 };
    }
    s.playerHistory = uniqueNames([
      s.teams.left.players[0], s.teams.left.players[1],
      s.teams.right.players[0], s.teams.right.players[1],
      ...s.playerHistory,
    ]);
    // A new lineup starts at nil all.
    s.game = newGame(s.game.targetScore);
  }, ['teams', 'game', 'playerHistory']);
  closeModal('modal-teams');
}

/* ---------------------------------------------------------------- colours */

let activeColorSide = 'left';
let wheel = null;

/**
 * Build the colour wheel once, on first open. If the library did not load -
 * offline on a cold start, or under a test runner with no DOM measurement -
 * the native colour input is shown instead, so the modal is never a dead end.
 */
function ensureWheel() {
  if (wheel || typeof iro === 'undefined') return;
  const mount = $('#wheel');
  if (!mount) return;
  try {
    wheel = new iro.ColorPicker(mount, {
      width: Math.min(240, Math.round(window.innerWidth * 0.62)),
      color: getState().teamColors[activeColorSide],
      layout: [{ component: iro.ui.Wheel }, { component: iro.ui.Slider, options: { sliderType: 'value' } }],
    });
    wheel.on('color:change', (color) => {
      const hex = color.hexString;
      if (getState().teamColors[activeColorSide] === hex) return;
      setState((s) => { s.teamColors[activeColorSide] = hex; }, ['teamColors']);
      setText($('#color-hex'), hex.toUpperCase());
    });
  } catch {
    wheel = null;
  }
}

function syncColorsModal() {
  const colour = getState().teamColors[activeColorSide];
  $$('[data-color-side]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.colorSide === activeColorSide)));
  setText($('#color-hex'), String(colour).toUpperCase());
  if (wheel && wheel.color.hexString.toLowerCase() !== String(colour).toLowerCase()) {
    wheel.color.set(colour);
  }
  const fallback = $('#color-fallback');
  fallback.hidden = Boolean(wheel);
  fallback.value = colour;
}

function openColorsModal(side = activeColorSide) {
  activeColorSide = side;
  setHtml($('#presets'), PRESETS.map((c) =>
    html`<button class="preset" data-preset="${c}" style="background:${c}" aria-label="Use ${c}"></button>`).join(''));
  openModal('modal-colors');
  ensureWheel();
  syncColorsModal();
}

function openTargetModal() {
  setHtml($('#target-choices'), TARGETS.map((t) =>
    html`<button class="choice" data-target="${t}" aria-pressed="${getState().game.targetScore === t ? 'true' : 'false'}">Play to ${t}</button>`).join(''));
  openModal('modal-target');
}

/* ------------------------------------------------------------------ toast */

let toastAction = null;
function toast(message, action, actionLabel = 'Refresh') {
  setText($('#toast-text'), message);
  toastAction = action;
  $('#toast-go').hidden = !action;
  setText($('#toast-go'), actionLabel);
  $('#toast').hidden = false;
}
const hideToast = () => { $('#toast').hidden = true; };

/* ------------------------------------------------------------------- menu */

const closeMenu = () => {
  $('#menu').hidden = true;
  $('#menu-btn').setAttribute('aria-expanded', 'false');
};

const MENU = {
  history: () => showScreen('history'),
  baggers: () => showScreen('baggers'),
  players: () => showScreen('players'),
  tournament: () => { window.location.href = '../quickbracket/index.html'; },
  teams: openTeamsModal,
  colors: openColorsModal,
  target: openTargetModal,
  about: () => openModal('modal-about'),
  refresh: applyUpdate,
  share: () => shareText(`Score a cornhole game with QuickCorn: ${location.href}`),
  newGame: () => { if (confirm('Start a new game?')) resetGame(); },
  trackInOn: () => setState((s) => { s.trackInOn = !s.trackInOn; s.ui.breakdown = null; }, ['trackInOn']),
};

/* ------------------------------------------------------------------ wiring */

function wire() {
  const menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#menu');
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', closeMenu);

  on($('#menu'), 'click', '[data-menu]', (e, btn) => {
    const action = btn.dataset.menu;
    if (action === 'trackInOn') {
      // A switch should show its new state, so the menu stays open.
      e.stopPropagation();
      MENU.trackInOn();
      return;
    }
    closeMenu();
    MENU[action]?.();
  });

  on(document.body, 'click', '[data-close-screen]', () => showScreen('game'));
  on(document.body, 'click', '[data-dismiss]', (e, btn) => { closeModal(btn.closest('.modal-wrap').id); });
  $$('.modal-wrap').forEach((wrap) => {
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.hidden = true; });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAllModals(); closeMenu(); } });

  // Entry pads
  on(document.body, 'click', '[data-pad]', (e, btn) => {
    const { pad, kind, value } = btn.dataset;
    if (kind === 'total') setTotal(pad, Number(value));
    else setBag(pad, kind, Number(value));
  });
  on(document.body, 'click', '[data-scoring]', (e, btn) => {
    setState((s) => {
      s.scoringMode = btn.dataset.scoring;
      s.game.currentEntry = { left: emptyEntry(), right: emptyEntry() };
    }, ['scoringMode', 'game']);
  });
  on(document.body, 'click', '[data-breakdown]', (e, btn) => {
    const holder = $('#breakdown-choices');
    const [inCount, onCount] = btn.dataset.breakdown.split('-').map(Number);
    const side = holder.dataset.side;
    const total = Number(holder.dataset.total);
    setState((s) => { s.game.currentEntry[side] = { in: inCount, on: onCount, total }; }, ['game']);
    closeModal('modal-breakdown');
  });
  on(document.body, 'click', '[data-round]', (e, btn) => selectRound(Number(btn.dataset.round)));
  on(document.body, 'click', '[data-color-btn]', (e, btn) => openColorsModal(btn.dataset.colorBtn));

  // The way into the diagnostic from inside the installed app; see openDiagnostics.
  $('#brand-version').addEventListener('click', openDiagnostics);

  $('#submit-btn').addEventListener('click', submitRound);
  $('#clear-btn').addEventListener('click', clearEntry);

  // Teams modal
  on(document.body, 'click', '[data-team-mode]', (e, btn) => {
    setState((s) => { s.ui.draftTeamMode = btn.dataset.teamMode; }, []);
    syncTeamsModal();
  });
  on(document.body, 'click', '[data-first-pair]', (e, btn) => {
    const pair = Number(btn.dataset.firstPair);
    setState((s) => { s.firstShooter = { left: pair, right: pair }; }, ['firstShooter']);
    syncTeamsModal();
  });
  ['in-left-1', 'in-left-2', 'in-right-1', 'in-right-2'].forEach((id) => {
    const input = $(`#${id}`);
    input.addEventListener('input', syncTeamsModal);
    input.addEventListener('focus', () => { if (/^Player \d$/.test(input.value)) input.value = ''; });
  });
  $('#save-teams').addEventListener('click', saveTeams);
  $('#swap-colors').addEventListener('click', () => {
    setState((s) => {
      const left = s.teamColors.left;
      s.teamColors.left = s.teamColors.right;
      s.teamColors.right = left;
    }, ['teamColors']);
  });

  // Colours
  on(document.body, 'click', '[data-color-side]', (e, btn) => {
    activeColorSide = btn.dataset.colorSide;
    syncColorsModal();
  });
  on(document.body, 'click', '[data-preset]', (e, btn) => {
    setState((s) => { s.teamColors[activeColorSide] = btn.dataset.preset; }, ['teamColors']);
    syncColorsModal();
  });
  $('#color-fallback').addEventListener('input', (e) => {
    setState((s) => { s.teamColors[activeColorSide] = e.target.value; }, ['teamColors']);
    setText($('#color-hex'), e.target.value.toUpperCase());
  });
  $('#reset-colors').addEventListener('click', () => {
    setState((s) => { s.teamColors = { ...DEFAULT_COLORS }; }, ['teamColors']);
    syncColorsModal();
  });

  // Tapping a name on the scoreboard edits that player.
  on(document.body, 'click', '[data-edit]', (e, btn) => {
    const [side, index] = btn.dataset.edit.split('-');
    openTeamsModal();
    const input = $(`#in-${side}-${Number(index) + 1}`);
    if (!input || input.closest('[data-second-player]')?.hidden) return;
    focusAtEnd(input);
  });

  // Target score
  on(document.body, 'click', '[data-target]', (e, btn) => {
    const target = Number(btn.dataset.target);
    setState((s) => { s.game = newGame(target); }, ['game']);
    closeModal('modal-target');
  });

  // Win modal
  $('#play-again').addEventListener('click', () => { closeModal('modal-win'); resetGame(); });
  $('#share-result').addEventListener('click', shareResult);

  // Lists
  on(document.body, 'click', '[data-delete-game]', (e, btn) => {
    if (!confirm('Delete this game?')) return;
    setState((s) => { s.gameHistory = s.gameHistory.filter((x) => x.id !== btn.dataset.deleteGame); }, ['gameHistory']);
  });
  on(document.body, 'click', '[data-delete-bagger]', (e, btn) => {
    setState((s) => { s.fourBaggers = s.fourBaggers.filter((x) => x.id !== btn.dataset.deleteBagger); }, ['fourBaggers']);
  });
  on(document.body, 'click', '[data-rename]', (e, btn) => {
    const from = btn.dataset.rename;
    const to = safeText(prompt(`Rename ${from} to:`, from), '');
    if (!to || to === from) return;
    setState((s) => {
      s.playerHistory = uniqueNames(s.playerHistory.map((n) => (n === from ? to : n)));
      s.fourBaggers = s.fourBaggers.map((x) => (x.playerName === from ? { ...x, playerName: to } : x));
      for (const side of R.SIDES) {
        s.teams[side].players = s.teams[side].players.map((n) => (n === from ? to : n));
      }
    }, ['playerHistory', 'fourBaggers', 'teams']);
  });
  on(document.body, 'click', '[data-remove-player]', (e, btn) => {
    const name = btn.dataset.removePlayer;
    if (!confirm(`Remove ${name} and their saved 4-baggers?`)) return;
    const key = name.toLowerCase();
    setState((s) => {
      s.playerHistory = s.playerHistory.filter((n) => n.toLowerCase() !== key);
      s.fourBaggers = s.fourBaggers.filter((x) => x.playerName.toLowerCase() !== key);
    }, ['playerHistory', 'fourBaggers']);
  });
  $('#add-player-btn').addEventListener('click', () => {
    const name = safeText($('#new-player').value, '');
    if (!name) return;
    setState((s) => { s.playerHistory = uniqueNames([name, ...s.playerHistory]); }, ['playerHistory']);
    $('#new-player').value = '';
  });
  $('#bagger-year').addEventListener('change', (e) => {
    setState((s) => { s.ui.fourBaggerYear = e.target.value; }, ['fourBaggers']);
  });

  // Toast
  $('#toast-go').addEventListener('click', () => { hideToast(); toastAction?.(); });
  $('#toast-dismiss').addEventListener('click', hideToast);

  window.addEventListener('pagehide', flush);
}

/* ------------------------------------------------------------------- boot */

const GAME_KEYS = ['game', 'teams', 'mode', 'scoringMode', 'firstShooter', 'teamColors', 'trackInOn'];

function render(state, changed) {
  const all = !changed || changed.size === 0;
  if (all || changed.has('teamColors')) applyTheme(state);
  if (all || GAME_KEYS.some((k) => changed.has(k))) renderGame(state);
  if (all || changed.has('screen') || changed.has('gameHistory') || changed.has('fourBaggers') || changed.has('playerHistory')) {
    renderScreens(state);
  }
  if (all || changed.has('trackInOn')) {
    $('#track-toggle').setAttribute('aria-checked', String(Boolean(state.trackInOn)));
  }
}

/**
 * Pin the shell to the height that is actually on screen.
 *
 * The app is one fixed-height screen with no scrolling, so if the shell is
 * taller than the visible area the bottom row simply is not there - and the
 * bottom row is the submit button. Viewport units are not dependable for this on
 * a phone: on Android the value can come back including the area behind the
 * system bars, which is exactly how the button ended up below the fold.
 * window.innerHeight is the number that is really visible, so it wins where it
 * exists, and the CSS keeps svh as the fallback.
 *
 * A resize while a field has focus is the keyboard opening. Shrinking the shell
 * to fit above it would squash the whole board, so those are left alone - the
 * keyboard covers the app rather than resizing it.
 */
export function visibleHeight() {
  // visualViewport is what is genuinely on screen; innerHeight can still include
  // area behind system bars. Take the smaller, and ignore a visualViewport that
  // has shrunk for the keyboard - that is handled by not applying at all while a
  // field has focus.
  const inner = window.innerHeight || 0;
  const visual = window.visualViewport?.height || 0;
  if (!inner) return visual;
  if (!visual) return inner;
  return Math.min(inner, visual);
}

function trackViewportHeight() {
  const apply = () => {
    // A zero reading happens mid-load in some browsers; leaving the variable
    // unset falls back to 100svh rather than collapsing the app to nothing.
    const height = visibleHeight();
    if (!height) return;
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
  };
  apply();
  const onResize = () => {
    if (document.activeElement?.tagName === 'INPUT') return;
    apply();
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  // The reported height lags the rotation, so read it after the browser settles.
  window.addEventListener('orientationchange', () => setTimeout(apply, 150));
}

function init() {
  trackViewportHeight();
  setText($('#brand-version'), `v${APP_VERSION}`);
  setText($('#about-version'), `Version ${APP_VERSION}`);
  wire();
  subscribe(render);
  render(getState(), null);
  startUpdateWatch(APP_VERSION, (liveVersion) => {
    toast(`Update to ${liveVersion}`, applyUpdate);
  });
  if (new URLSearchParams(location.search).has('diag')) openDiagnostics();
}

/**
 * The layout numbers, read off the device.
 *
 * Reachable two ways because the interesting case is the installed app, and a
 * ?diag=1 URL cannot get there - the home screen icon carries its own start_url.
 * The version line under the title is the way in from inside. The module is
 * imported here rather than at the top so a normal load never fetches it.
 */
function openDiagnostics() {
  import('./diag.js').then((m) => m.showDiagnostics()).catch(() => {});
}

init();
