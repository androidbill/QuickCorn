// A small CSS cascade simulator, used by tests/layout.test.js.
//
// QuickCorn tunes type sizes across several overlapping media queries, and the
// same selector is often declared at the same breakpoint more than once, where
// only the last one takes effect. That makes it easy to "clean up" the
// stylesheet and silently change what the phone actually renders. This resolves
// what a given viewport really gets, so a refactor can be proven inert.
//
// It handles what QuickCorn's stylesheet uses: flat rules, @media blocks with
// max-width / min-width / max-height / min-height, and !important. It is not a
// general CSS engine and does not compute specificity - every selector compared
// here is matched as a literal string, so the comparisons are like for like.
import { readFileSync } from 'node:fs';

export function loadStylesheet(url) {
  const html = readFileSync(url, 'utf8');
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) throw new Error('No <style> block found in index.html');
  return match[1];
}

function parseConditions(query) {
  const conditions = [];
  const re = /\((max|min)-(width|height):\s*(\d+)px\)/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    conditions.push({ bound: m[1], axis: m[2], value: Number(m[3]) });
  }
  return conditions;
}

function mediaMatches(conditions, viewport) {
  return conditions.every(({ bound, axis, value }) => {
    const actual = axis === 'width' ? viewport.width : viewport.height;
    return bound === 'max' ? actual <= value : actual >= value;
  });
}

function pushDeclarations(out, prelude, body, conditions) {
  for (const selector of prelude.split(',').map((s) => s.trim()).filter(Boolean)) {
    for (const raw of body.split(';')) {
      const decl = raw.trim();
      if (!decl) continue;
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const prop = decl.slice(0, colon).trim();
      let value = decl.slice(colon + 1).trim();
      const important = /!important$/.test(value);
      if (important) value = value.replace(/!important$/, '').trim();
      out.push({ selector, prop, value, important, conditions });
    }
  }
}

// Returns declarations in document order: { selector, prop, value, important, conditions }
//
// Scans on brace depth rather than searching for the next brace, so a rule
// inside an @media block cannot be mistaken for the end of that block. Depth 0
// is the top level, depth 1 is inside a media block, and a rule body is one
// deeper than whatever contains it.
export function parseDeclarations(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let media = null;
  let depth = 0;
  let start = 0;
  let prelude = '';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      prelude = source.slice(start, i).trim();
      if (depth === 0 && prelude.startsWith('@media')) {
        media = parseConditions(prelude);
        depth = 1;
        start = i + 1;
        continue;
      }
      // A rule body. Find its matching close, honouring nesting.
      let inner = 1;
      let j = i + 1;
      for (; j < source.length && inner > 0; j++) {
        if (source[j] === '{') inner++;
        else if (source[j] === '}') inner--;
      }
      pushDeclarations(out, prelude, source.slice(i + 1, j - 1), media || []);
      i = j - 1;
      start = i + 1;
      continue;
    }
    if (ch === '}') {
      // Only reachable at media-block depth, since rule bodies are consumed above.
      if (depth === 1) {
        media = null;
        depth = 0;
      }
      start = i + 1;
    }
  }
  return out;
}

// The winning value for `selector`/`prop` at `viewport`: last matching
// declaration wins, with !important beating non-important.
export function resolve(declarations, selector, prop, viewport) {
  let winner = null;
  for (const decl of declarations) {
    if (decl.selector !== selector || decl.prop !== prop) continue;
    if (!mediaMatches(decl.conditions, viewport)) continue;
    if (winner && winner.important && !decl.important) continue;
    winner = decl;
  }
  return winner ? winner.value : null;
}
