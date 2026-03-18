export type FuzzyResult = { score: number; indices: number[] };

const SCORE_CONSECUTIVE = 8;
const SCORE_BOUNDARY = 10;
const SCORE_START = 12;
const SCORE_MATCH = 1;
const PENALTY_GAP_START = -3;
const PENALTY_GAP_EXTEND = -1;

function is_boundary(prev: string, curr: string): boolean {
  if (
    prev === "/" ||
    prev === "-" ||
    prev === "_" ||
    prev === " " ||
    prev === "."
  )
    return true;
  if (prev === prev.toLowerCase() && curr === curr.toUpperCase()) return true;
  return false;
}

export function fuzzy_score(query: string, target: string): FuzzyResult | null {
  if (query.length === 0) return null;
  if (query.length > target.length) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // quick check: all query chars exist in target in order
  let check = 0;
  for (let i = 0; i < t.length && check < q.length; i++) {
    if (t[i] === q[check]) check++;
  }
  if (check !== q.length) return null;

  let score = 0;
  const indices: number[] = [];
  let qi = 0;
  let prev_match_index = -1;
  let in_gap = false;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += SCORE_MATCH;

      if (prev_match_index >= 0 && ti === prev_match_index + 1) {
        score += SCORE_CONSECUTIVE;
      }

      if (ti === 0) {
        score += SCORE_START;
      } else if (
        ti > 0 &&
        is_boundary(target[ti - 1] ?? "", target[ti] ?? "")
      ) {
        score += SCORE_BOUNDARY;
      }

      indices.push(ti);
      prev_match_index = ti;
      in_gap = false;
      qi++;
    } else if (prev_match_index >= 0) {
      score += in_gap ? PENALTY_GAP_EXTEND : PENALTY_GAP_START;
      in_gap = true;
    }
  }

  if (qi !== q.length) return null;

  return { score, indices };
}

export function fuzzy_score_multi(
  query: string,
  ...targets: string[]
): FuzzyResult | null {
  let best: FuzzyResult | null = null;
  for (const target of targets) {
    const result = fuzzy_score(query, target);
    if (result && (best === null || result.score > best.score)) {
      best = result;
    }
  }
  return best;
}
