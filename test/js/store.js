/**
 * Application state, persistence and change notification.
 *
 * One object, one way to change it, and subscribers told what changed so a
 * screen can skip work it does not need. QuickCorn 1 redrew all four screens on
 * every tap, which meant a single bag entry re-sorted the whole 4-bagger
 * history; here a subscriber sees which top level keys moved and decides.
 */

/**
 * Deliberately not QuickCorn 1's key. localStorage is shared per origin, not
 * per path, so this app running at /test/ would otherwise read and write the
 * live app's saved games. It seeds itself from a copy instead, and never
 * writes to the old key.
 */
const STORAGE_KEY = 'quickcorn2';
const LEGACY_KEY = 'quickcorn_rebuilt_v1';

export const DEFAULT_COLORS = { left: '#2a9fd6', right: '#ba55d3' };

export function defaultState() {
  return {
    screen: 'game',
    mode: '2v2',
    scoringMode: 'acl',
    trackInOn: false,
    teamColors: { ...DEFAULT_COLORS },
    firstShooter: { left: 0, right: 0 },
    teams: {
      left: { players: ['Player 1', 'Player 2'] },
      right: { players: ['Player 3', 'Player 4'] },
    },
    game: newGame(),
    gameHistory: [],
    fourBaggers: [],
    playerHistory: [],
    ui: { breakdown: null, draftTeamMode: '2v2', fourBaggerYear: String(new Date().getFullYear()) },
  };
}

export function newGame(targetScore = 21) {
  return {
    sessionId: `session-${Date.now()}`,
    targetScore,
    rounds: [],
    editingRound: null,
    historyEntryId: null,
    currentEntry: { left: emptyEntry(), right: emptyEntry() },
  };
}

export const emptyEntry = () => ({ in: 0, on: 0, total: null });

/** Fill missing keys from defaults without discarding what is stored. */
function merge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const key of Object.keys(base)) {
      out[key] = merge(base[key], incoming && key in incoming ? incoming[key] : base[key]);
    }
    if (incoming) for (const key of Object.keys(incoming)) if (!(key in out)) out[key] = incoming[key];
    return out;
  }
  return incoming === undefined ? base : incoming;
}

/**
 * Read QuickCorn 1's saved data, renaming its red/blue sides to left/right.
 * Read only - the old key is never written to, so the live app is unaffected
 * whatever happens here.
 */
function importLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    return {
      mode: old.mode,
      scoringMode: old.scoringMode,
      trackInOn: old.trackInOn,
      teamColors: { left: old.teamColors?.red || DEFAULT_COLORS.left, right: old.teamColors?.blue || DEFAULT_COLORS.right },
      firstShooter: { left: Number(old.firstShooter?.red) || 0, right: Number(old.firstShooter?.blue) || 0 },
      teams: {
        left: { players: old.teams?.red?.players || ['Player 1', 'Player 2'] },
        right: { players: old.teams?.blue?.players || ['Player 3', 'Player 4'] },
      },
      playerHistory: old.playerHistory || [],
      gameHistory: (old.gameHistory || []).map((entry) => ({
        ...entry,
        winnerSide: entry.winnerSide === 'red' ? 'left' : entry.winnerSide === 'blue' ? 'right' : entry.winnerSide,
        stats: (entry.stats || []).map((row) => ({
          ...row,
          side: row.color === 'red' ? 'left' : row.color === 'blue' ? 'right' : row.side,
        })),
      })),
      fourBaggers: (old.fourBaggers || []).map((entry) => ({
        ...entry,
        side: entry.side === 'red' ? 'left' : entry.side === 'blue' ? 'right' : entry.side,
      })),
    };
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = merge(defaultState(), JSON.parse(raw));
      state.screen = 'game';
      state.ui.breakdown = null;
      return state;
    }
    const legacy = importLegacy();
    if (legacy) {
      const state = merge(defaultState(), legacy);
      state.game = newGame();
      state.screen = 'game';
      return state;
    }
  } catch {
    /* fall through to a clean state */
  }
  return defaultState();
}

let state = load();
const subscribers = new Set();

export const getState = () => state;

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

let depth = 0;
let touched = new Set();

/**
 * Mutate state and notify. `keys` names the top level areas that changed so
 * subscribers can skip redrawing what did not. Nested calls are coalesced into
 * a single notification.
 */
export function setState(mutator, keys = []) {
  depth++;
  try {
    mutator(state);
    for (const key of keys) touched.add(key);
  } finally {
    depth--;
  }
  if (depth > 0) return;

  const changed = touched;
  touched = new Set();
  persist();
  for (const fn of subscribers) fn(state, changed);
}

let persistTimer = null;
function persist() {
  // Coalesce writes; tapping through a round should not hit storage each time.
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked - the app keeps working in memory */
    }
  }, 120);
}

/** Force a synchronous write, for when the page is about to go away. */
export function flush() {
  clearTimeout(persistTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function resetGame() {
  setState((s) => {
    s.game = newGame(s.game.targetScore);
    s.ui.breakdown = null;
  }, ['game']);
}
