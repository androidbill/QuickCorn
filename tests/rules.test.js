import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The rules are not a separate file on purpose. QuickCorn ships as one
// index.html with no build step, and a second script would be cached
// independently of the page that uses it. So the tests slice the rules block
// out of index.html and run it directly - what is tested is what is served.
function loadRules() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const START = '// ==== QUICKCORN RULES START ====';
  const END = '// ==== QUICKCORN RULES END ====';
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error('Rules block sentinels not found in index.html. Did the comments get edited?');
  }
  const source = html.slice(start + START.length, end);
  return new Function(`${source}; return QC_RULES;`)();
}

const rules = loadRules();

// Mirrors TOTAL_VALUES in index.html - the totals the Total Number pad offers.
const TOTAL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

const acl = (inCount, onCount) => ({ in: inCount, on: onCount, total: inCount * 3 + onCount });
const total = (value) => ({ in: 0, on: 0, total: value });

describe('entryToPoints', () => {
  it('scores 3 for a bag in the hole and 1 for a bag on the board', () => {
    expect(rules.entryToPoints(acl(1, 0), 'acl')).toBe(3);
    expect(rules.entryToPoints(acl(0, 1), 'acl')).toBe(1);
    expect(rules.entryToPoints(acl(2, 2), 'acl')).toBe(8);
  });

  it('caps a perfect round at 12', () => {
    expect(rules.entryToPoints(acl(4, 0), 'acl')).toBe(12);
  });

  it('uses the raw total in Total Number mode and ignores in/on', () => {
    expect(rules.entryToPoints({ in: 0, on: 0, total: 7 }, 'total')).toBe(7);
    // This is the case the Track IN/ON toggle produces when it is off.
    expect(rules.entryToPoints({ in: 0, on: 0, total: 6 }, 'total')).toBe(6);
  });

  it('treats an untouched entry as zero rather than NaN', () => {
    expect(rules.entryToPoints({ in: 0, on: 0, total: null }, 'total')).toBe(0);
  });
});

describe('entryBreakdownOptions', () => {
  it('is unambiguous for totals with a single split', () => {
    expect(rules.entryBreakdownOptions(12)).toEqual([{ in: 4, on: 0 }]);
    expect(rules.entryBreakdownOptions(0)).toEqual([{ in: 0, on: 0 }]);
    expect(rules.entryBreakdownOptions(9)).toEqual([{ in: 3, on: 0 }]);
  });

  it('is ambiguous for exactly 3, 4 and 6 - the totals that trigger the prompt', () => {
    const ambiguous = TOTAL_VALUES.filter((v) => rules.entryBreakdownOptions(v).length > 1);
    expect(ambiguous).toEqual([3, 4, 6]);
  });

  it('offers both readings of an ambiguous total', () => {
    expect(rules.entryBreakdownOptions(3)).toEqual([{ in: 0, on: 3 }, { in: 1, on: 0 }]);
    expect(rules.entryBreakdownOptions(6)).toEqual([{ in: 1, on: 3 }, { in: 2, on: 0 }]);
  });

  it('never proposes more than four bags', () => {
    for (let value = 0; value <= 12; value++) {
      for (const opt of rules.entryBreakdownOptions(value)) {
        expect(opt.in + opt.on).toBeLessThanOrEqual(4);
        expect(opt.in * 3 + opt.on).toBe(value);
      }
    }
  });

  it('has no split for 11, which is why the pad omits it', () => {
    expect(rules.entryBreakdownOptions(11)).toEqual([]);
    expect(TOTAL_VALUES).not.toContain(11);
  });

  it('offers a split for every total the pad can produce', () => {
    for (const value of TOTAL_VALUES) {
      expect(rules.entryBreakdownOptions(value).length).toBeGreaterThan(0);
    }
  });
});

describe('validateEntry', () => {
  it('accepts a round using four bags or fewer', () => {
    expect(rules.validateEntry(acl(4, 0))).toBe(true);
    expect(rules.validateEntry(acl(2, 2))).toBe(true);
    expect(rules.validateEntry(acl(0, 0))).toBe(true);
  });

  it('rejects more than four bags', () => {
    expect(rules.validateEntry(acl(3, 2))).toBe(false);
  });

  it('rejects negative counts', () => {
    expect(rules.validateEntry({ in: -1, on: 0 })).toBe(false);
  });
});

describe('scoreRound', () => {
  it('cancels, awarding only the difference to the higher side', () => {
    const round = rules.scoreRound(acl(1, 1), acl(0, 2), 'acl');
    expect(round.redGross).toBe(4);
    expect(round.blueGross).toBe(2);
    expect(round.redNet).toBe(2);
    expect(round.blueNet).toBe(0);
  });

  it('gives an equal round to nobody', () => {
    const round = rules.scoreRound(acl(1, 0), acl(0, 3), 'acl');
    expect(round.redGross).toBe(3);
    expect(round.blueGross).toBe(3);
    expect(round.redNet).toBe(0);
    expect(round.blueNet).toBe(0);
  });

  it('awards the difference to blue when blue is higher', () => {
    const round = rules.scoreRound(acl(0, 1), acl(2, 0), 'acl');
    expect(round.blueNet).toBe(5);
    expect(round.redNet).toBe(0);
  });

  it('keeps the raw entry alongside the score so a round can be edited later', () => {
    const round = rules.scoreRound(acl(2, 1), acl(0, 0), 'acl');
    expect(round.redIn).toBe(2);
    expect(round.redOn).toBe(1);
    expect(round.redTotalRaw).toBe(7);
  });

  it('scores Total Number mode off the totals', () => {
    const round = rules.scoreRound(total(6), total(4), 'total');
    expect(round.redNet).toBe(2);
    expect(round.blueNet).toBe(0);
  });
});

describe('getTotals', () => {
  it('is zero to zero before any rounds', () => {
    expect(rules.getTotals([])).toEqual({ red: 0, blue: 0 });
  });

  it('accumulates net points only', () => {
    const rounds = [
      rules.scoreRound(acl(1, 0), acl(0, 0), 'acl'),
      rules.scoreRound(acl(0, 0), acl(1, 1), 'acl'),
      rules.scoreRound(acl(1, 0), acl(0, 3), 'acl'),
    ];
    expect(rules.getTotals(rounds)).toEqual({ red: 3, blue: 4 });
  });
});

describe('getWinnerSide', () => {
  const reach = (side, points) => {
    const entry = side === 'red' ? [acl(0, points), acl(0, 0)] : [acl(0, 0), acl(0, points)];
    return rules.scoreRound(entry[0], entry[1], 'acl');
  };

  it('has no winner below the target', () => {
    expect(rules.getWinnerSide([reach('red', 4)], 21)).toBe(null);
  });

  it('wins on reaching the target exactly', () => {
    const rounds = Array.from({ length: 6 }, () => reach('red', 4));
    expect(rules.getTotals(rounds).red).toBe(24);
    expect(rules.getWinnerSide(rounds, 21)).toBe('red');
  });

  it('respects a custom target', () => {
    const rounds = [reach('blue', 4), reach('blue', 4)];
    expect(rules.getWinnerSide(rounds, 7)).toBe('blue');
    expect(rules.getWinnerSide(rounds, 21)).toBe(null);
  });

  it('gives it to the higher score if both are somehow past the target', () => {
    const rounds = [
      { redNet: 22, blueNet: 0 },
      { redNet: 0, blueNet: 25 },
    ];
    expect(rules.getWinnerSide(rounds, 21)).toBe('blue');
  });
});

describe('currentThrower', () => {
  it('is always the only player in 1v1', () => {
    expect(rules.currentThrower('1v1', 0, 0)).toBe(0);
    expect(rules.currentThrower('1v1', 1, 5)).toBe(0);
  });

  it('alternates partners each round in 2v2', () => {
    expect(rules.currentThrower('2v2', 0, 0)).toBe(0);
    expect(rules.currentThrower('2v2', 0, 1)).toBe(1);
    expect(rules.currentThrower('2v2', 0, 2)).toBe(0);
  });

  it('starts with the other partner when they opened the game', () => {
    expect(rules.currentThrower('2v2', 1, 0)).toBe(1);
    expect(rules.currentThrower('2v2', 1, 1)).toBe(0);
  });

  it('falls back to the first player when firstShooter is missing', () => {
    expect(rules.currentThrower('2v2', undefined, 0)).toBe(0);
    expect(rules.currentThrower('2v2', null, 1)).toBe(1);
  });
});

describe('isFourBaggerRound', () => {
  it('detects four in the hole from the split', () => {
    const round = rules.scoreRound(acl(4, 0), acl(0, 0), 'acl');
    expect(rules.isFourBaggerRound(round, 'red')).toBe(true);
    expect(rules.isFourBaggerRound(round, 'blue')).toBe(false);
  });

  it('detects it from a total of 12 when the split was never recorded', () => {
    // What Total Number mode stores with the Track IN/ON toggle off.
    const round = rules.scoreRound(total(12), total(0), 'total');
    expect(round.redIn).toBe(0);
    expect(rules.isFourBaggerRound(round, 'red')).toBe(true);
  });

  it('still counts a four bagger that got cancelled out', () => {
    const round = rules.scoreRound(acl(4, 0), acl(4, 0), 'acl');
    expect(round.redNet).toBe(0);
    expect(rules.isFourBaggerRound(round, 'red')).toBe(true);
    expect(rules.isFourBaggerRound(round, 'blue')).toBe(true);
  });

  it('does not count 12 points made without four in the hole', () => {
    // Not reachable with four bags, but guards the gross check from false hits.
    const round = rules.scoreRound(acl(3, 1), acl(0, 0), 'acl');
    expect(round.redGross).toBe(10);
    expect(rules.isFourBaggerRound(round, 'red')).toBe(false);
  });
});

describe('pointsPerRound', () => {
  it('averages to two decimals', () => {
    expect(rules.pointsPerRound(10, 4)).toBe('2.50');
    expect(rules.pointsPerRound(7, 3)).toBe('2.33');
  });

  it('does not divide by zero before any rounds', () => {
    expect(rules.pointsPerRound(0, 0)).toBe('0.00');
  });
});
