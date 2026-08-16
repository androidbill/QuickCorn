/**
 * Cornhole scoring rules.
 *
 * Pure functions, no state and no DOM. Every input arrives as an argument so
 * this can be imported straight into a test. Ported from QuickCorn 1, where
 * these same rules pass 34 tests - the logic is the part of the old app that
 * was worth keeping, so it is carried over deliberately rather than rewritten
 * from memory.
 *
 * Sides are `left` and `right`. QuickCorn 1 called them `red` and `blue`, which
 * stopped being true the moment team colours became configurable.
 */

export const SIDES = ['left', 'right'];
export const BAGS_PER_ROUND = 4;
export const IN_VALUE = 3;
export const ON_VALUE = 1;

/** Totals the Total Number pad offers. 11 is absent because four bags cannot make it. */
export const TOTAL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

export const otherSide = (side) => (side === 'left' ? 'right' : 'left');

/** Points for one side's round. In ACL mode from the bag split, otherwise the total tapped. */
export function entryToPoints(entry, scoringMode) {
  if (scoringMode === 'acl') return entry.in * IN_VALUE + entry.on * ON_VALUE;
  return entry.total == null ? 0 : entry.total;
}

/**
 * Every in/on split that adds up to `total`.
 * Length 0 means unreachable with four bags, 1 means unambiguous, more than 1
 * means the app must ask or assume - which is only 3, 4 and 6.
 */
export function entryBreakdownOptions(total) {
  const options = [];
  for (let inCount = 0; inCount <= BAGS_PER_ROUND; inCount++) {
    for (let onCount = 0; onCount <= BAGS_PER_ROUND; onCount++) {
      if (inCount + onCount > BAGS_PER_ROUND) continue;
      if (inCount * IN_VALUE + onCount * ON_VALUE === total) options.push({ in: inCount, on: onCount });
    }
  }
  return options;
}

export function validateEntry(entry) {
  return entry.in >= 0 && entry.on >= 0 && entry.in + entry.on <= BAGS_PER_ROUND;
}

/** Cancellation scoring: only the difference counts, and only to one side. */
export function scoreRound(leftEntry, rightEntry, scoringMode) {
  const leftPoints = entryToPoints(leftEntry, scoringMode);
  const rightPoints = entryToPoints(rightEntry, scoringMode);
  const net = leftPoints - rightPoints;
  return {
    leftIn: leftEntry.in, leftOn: leftEntry.on, leftTotalRaw: leftEntry.total,
    rightIn: rightEntry.in, rightOn: rightEntry.on, rightTotalRaw: rightEntry.total,
    leftGross: leftPoints, rightGross: rightPoints,
    leftNet: net > 0 ? net : 0,
    rightNet: net < 0 ? -net : 0,
  };
}

export function getTotals(rounds) {
  return rounds.reduce(
    (acc, round) => ({ left: acc.left + round.leftNet, right: acc.right + round.rightNet }),
    { left: 0, right: 0 }
  );
}

export function getWinnerSide(rounds, targetScore) {
  const { left, right } = getTotals(rounds);
  if (left < targetScore && right < targetScore) return null;
  if (left >= targetScore && right >= targetScore) return left >= right ? 'left' : 'right';
  return left >= targetScore ? 'left' : 'right';
}

/**
 * Which of a side's two players throws in a given round.
 * In 2v2 partners alternate; `firstShooter` says which opened the game.
 */
export function currentThrower(mode, firstShooter, roundIndex) {
  if (mode === '1v1') return 0;
  return ((Number(firstShooter) || 0) + roundIndex) % 2;
}

/**
 * All four bags in the hole. The gross and raw checks catch a round entered as
 * a total of 12 in Total Number mode, where the split may not be recorded.
 */
export function isFourBaggerRound(round, side) {
  const inCount = side === 'left' ? round.leftIn : round.rightIn;
  const gross = side === 'left' ? round.leftGross : round.rightGross;
  const raw = side === 'left' ? round.leftTotalRaw : round.rightTotalRaw;
  const perfect = BAGS_PER_ROUND * IN_VALUE;
  return inCount === BAGS_PER_ROUND || gross === perfect || raw === perfect;
}

export function pointsPerRound(total, rounds) {
  return rounds ? (total / rounds).toFixed(2) : '0.00';
}

/** The side that scored last throws first next round; a wash leaves it unchanged. */
export function lastScoringRound(rounds) {
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].leftNet > 0 || rounds[i].rightNet > 0) return { round: rounds[i], index: i };
  }
  return null;
}

/** Per-player totals, rounds thrown and points per round for the current game. */
export function computePlayerStats(rounds, mode, teams, firstShooter) {
  const rows = [];
  for (const side of SIDES) {
    const gross = (r) => (side === 'left' ? r.leftGross : r.rightGross);
    if (mode === '1v1') {
      rows.push(makeStat(teams[side].players[0], side, 0, rounds.map(gross), mode, firstShooter));
      continue;
    }
    for (let player = 0; player < 2; player++) {
      if (!teams[side].players[player]) continue;
      const own = rounds.filter((_, i) => currentThrower(mode, firstShooter[side], i) === player);
      rows.push(makeStat(teams[side].players[player], side, player, own.map(gross), mode, firstShooter));
    }
  }
  return rows;
}

function makeStat(name, side, playerIndex, gross, mode, firstShooter) {
  const total = gross.reduce((a, b) => a + b, 0);
  return {
    name: String(name || '').trim() || 'Player',
    side,
    total,
    rounds: gross.length,
    ppr: pointsPerRound(total, gross.length),
    order: mode === '2v2' ? (playerIndex === (Number(firstShooter[side]) || 0) ? 'First' : 'Second') : '',
  };
}
