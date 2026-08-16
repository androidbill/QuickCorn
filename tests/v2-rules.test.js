import { describe, it, expect } from 'vitest';
import * as R from '../test/js/rules.js';

// QuickCorn 2's rules are a real module, so this imports them directly rather
// than slicing them out of index.html the way the v1 suite has to. Same
// coverage, carried over deliberately: these rules are the part of the old app
// that was worth keeping, and the tests are how that is verified rather than
// assumed.

const acl = (i, o) => ({ in: i, on: o, total: i * 3 + o });
const total = (v) => ({ in: 0, on: 0, total: v });

describe('entryToPoints', () => {
  it('scores 3 in the hole and 1 on the board', () => {
    expect(R.entryToPoints(acl(1, 0), 'acl')).toBe(3);
    expect(R.entryToPoints(acl(0, 1), 'acl')).toBe(1);
    expect(R.entryToPoints(acl(2, 2), 'acl')).toBe(8);
    expect(R.entryToPoints(acl(4, 0), 'acl')).toBe(12);
  });

  it('uses the tapped total in Total mode and ignores in/on', () => {
    expect(R.entryToPoints({ in: 0, on: 0, total: 6 }, 'total')).toBe(6);
  });

  it('treats an untouched entry as zero, not NaN', () => {
    expect(R.entryToPoints({ in: 0, on: 0, total: null }, 'total')).toBe(0);
  });
});

describe('entryBreakdownOptions', () => {
  it('is ambiguous for exactly 3, 4 and 6', () => {
    const ambiguous = R.TOTAL_VALUES.filter((v) => R.entryBreakdownOptions(v).length > 1);
    expect(ambiguous).toEqual([3, 4, 6]);
  });

  it('is unambiguous for a perfect round', () => {
    expect(R.entryBreakdownOptions(12)).toEqual([{ in: 4, on: 0 }]);
  });

  it('never proposes more than four bags, and always sums correctly', () => {
    for (let v = 0; v <= 12; v++) {
      for (const o of R.entryBreakdownOptions(v)) {
        expect(o.in + o.on).toBeLessThanOrEqual(4);
        expect(o.in * 3 + o.on).toBe(v);
      }
    }
  });

  it('has no split for 11, which is why the pad omits it', () => {
    expect(R.entryBreakdownOptions(11)).toEqual([]);
    expect(R.TOTAL_VALUES).not.toContain(11);
  });

  it('offers a split for every total the pad can produce', () => {
    for (const v of R.TOTAL_VALUES) expect(R.entryBreakdownOptions(v).length).toBeGreaterThan(0);
  });
});

describe('validateEntry', () => {
  it('accepts four bags or fewer', () => {
    expect(R.validateEntry(acl(4, 0))).toBe(true);
    expect(R.validateEntry(acl(2, 2))).toBe(true);
  });

  it('rejects more than four bags and negatives', () => {
    expect(R.validateEntry(acl(3, 2))).toBe(false);
    expect(R.validateEntry({ in: -1, on: 0 })).toBe(false);
  });
});

describe('scoreRound', () => {
  it('cancels, awarding only the difference', () => {
    const round = R.scoreRound(acl(1, 1), acl(0, 2), 'acl');
    expect(round.leftGross).toBe(4);
    expect(round.rightGross).toBe(2);
    expect(round.leftNet).toBe(2);
    expect(round.rightNet).toBe(0);
  });

  it('gives an equal round to nobody', () => {
    const round = R.scoreRound(acl(1, 0), acl(0, 3), 'acl');
    expect(round.leftNet).toBe(0);
    expect(round.rightNet).toBe(0);
  });

  it('keeps the raw entry so a round can be edited later', () => {
    const round = R.scoreRound(acl(2, 1), acl(0, 0), 'acl');
    expect(round.leftIn).toBe(2);
    expect(round.leftOn).toBe(1);
    expect(round.leftTotalRaw).toBe(7);
  });

  it('scores Total mode off the totals', () => {
    const round = R.scoreRound(total(6), total(4), 'total');
    expect(round.leftNet).toBe(2);
  });
});

describe('getWinnerSide', () => {
  const reach = (side, points) =>
    R.scoreRound(side === 'left' ? acl(0, points) : acl(0, 0), side === 'left' ? acl(0, 0) : acl(0, points), 'acl');

  it('has no winner below the target', () => {
    expect(R.getWinnerSide([reach('left', 4)], 21)).toBe(null);
  });

  it('wins on reaching the target', () => {
    const rounds = Array.from({ length: 6 }, () => reach('left', 4));
    expect(R.getTotals(rounds).left).toBe(24);
    expect(R.getWinnerSide(rounds, 21)).toBe('left');
  });

  it('respects a custom target', () => {
    const rounds = [reach('right', 4), reach('right', 4)];
    expect(R.getWinnerSide(rounds, 7)).toBe('right');
    expect(R.getWinnerSide(rounds, 21)).toBe(null);
  });

  it('gives it to the higher score if both are past the target', () => {
    expect(R.getWinnerSide([{ leftNet: 22, rightNet: 0 }, { leftNet: 0, rightNet: 25 }], 21)).toBe('right');
  });
});

describe('currentThrower', () => {
  it('is always the only player in 1v1', () => {
    expect(R.currentThrower('1v1', 1, 5)).toBe(0);
  });

  it('alternates partners each round in 2v2', () => {
    expect(R.currentThrower('2v2', 0, 0)).toBe(0);
    expect(R.currentThrower('2v2', 0, 1)).toBe(1);
    expect(R.currentThrower('2v2', 1, 0)).toBe(1);
  });

  it('falls back to the first player when firstShooter is missing', () => {
    expect(R.currentThrower('2v2', undefined, 0)).toBe(0);
  });
});

describe('isFourBaggerRound', () => {
  it('detects four in the hole from the split', () => {
    const round = R.scoreRound(acl(4, 0), acl(0, 0), 'acl');
    expect(R.isFourBaggerRound(round, 'left')).toBe(true);
    expect(R.isFourBaggerRound(round, 'right')).toBe(false);
  });

  it('detects it from a bare total of 12 when the split was not recorded', () => {
    const round = R.scoreRound(total(12), total(0), 'total');
    expect(round.leftIn).toBe(0);
    expect(R.isFourBaggerRound(round, 'left')).toBe(true);
  });

  it('still counts one that got cancelled out', () => {
    const round = R.scoreRound(acl(4, 0), acl(4, 0), 'acl');
    expect(round.leftNet).toBe(0);
    expect(R.isFourBaggerRound(round, 'left')).toBe(true);
    expect(R.isFourBaggerRound(round, 'right')).toBe(true);
  });

  it('does not count 10 points made without four in', () => {
    expect(R.isFourBaggerRound(R.scoreRound(acl(3, 1), acl(0, 0), 'acl'), 'left')).toBe(false);
  });
});

describe('lastScoringRound', () => {
  it('is null before anyone scores', () => {
    expect(R.lastScoringRound([])).toBe(null);
    expect(R.lastScoringRound([R.scoreRound(acl(1, 0), acl(1, 0), 'acl')])).toBe(null);
  });

  it('skips washes, so the hammer stays with whoever last scored', () => {
    const rounds = [
      R.scoreRound(acl(1, 0), acl(0, 0), 'acl'),
      R.scoreRound(acl(1, 0), acl(1, 0), 'acl'),
    ];
    expect(R.lastScoringRound(rounds).index).toBe(0);
  });
});

describe('computePlayerStats', () => {
  const teams = { left: { players: ['Ann', 'Bob'] }, right: { players: ['Cal', 'Dee'] } };
  const firstShooter = { left: 0, right: 0 };

  it('splits rounds between partners in 2v2', () => {
    const rounds = [
      R.scoreRound(acl(1, 0), acl(0, 0), 'acl'),
      R.scoreRound(acl(0, 2), acl(0, 0), 'acl'),
    ];
    const stats = R.computePlayerStats(rounds, '2v2', teams, firstShooter);
    const ann = stats.find((s) => s.name === 'Ann');
    const bob = stats.find((s) => s.name === 'Bob');
    expect(ann.rounds).toBe(1);
    expect(ann.total).toBe(3);
    expect(bob.rounds).toBe(1);
    expect(bob.total).toBe(2);
  });

  it('gives both rounds to the single player in 1v1', () => {
    const rounds = [R.scoreRound(acl(1, 0), acl(0, 0), 'acl'), R.scoreRound(acl(1, 0), acl(0, 0), 'acl')];
    const stats = R.computePlayerStats(rounds, '1v1', teams, firstShooter);
    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.name === 'Ann').rounds).toBe(2);
  });

  it('reports points per round to two decimals without dividing by zero', () => {
    const stats = R.computePlayerStats([], '1v1', teams, firstShooter);
    expect(stats[0].ppr).toBe('0.00');
    expect(R.pointsPerRound(7, 3)).toBe('2.33');
  });
});
