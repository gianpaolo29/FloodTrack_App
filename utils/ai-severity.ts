import type { Severity } from '@/types';

/**
 * Keyword patterns ordered from most severe → least severe.
 * The first match wins, so "chest-deep" beats "ankle-deep" if both appear.
 */
const SEVERITY_KEYWORDS: Array<{ severity: Severity; patterns: RegExp }> = [
  {
    severity: 'critical',
    patterns:
      /chest[- ]?(deep|level|high)|neck[- ]?deep|completely\s*submerged|life[- ]?threaten|extreme\s*flood|over\s*4\s*f(ee)?t|rooftop|swept\s*away|total(ly)?\s*flood|entire\s*(house|building|street)\s*(under|flood)|rescue\s*need/i,
  },
  {
    severity: 'high',
    patterns:
      /waist[- ]?(deep|level|high)|thigh[- ]?deep|severe\s*flood|deep\s*water|3\s*f(ee)?t|submerged\s*vehicle|impassable|dangerous(ly)?|major\s*flood|significant(ly)?\s*deep|cars?\s*(submerge|flood|stuck)|cannot\s*pass|road\s*closed/i,
  },
  {
    severity: 'moderate',
    patterns:
      /knee[- ]?(deep|level|high)|moderate\s*flood|rising\s*water|partially?\s*(submerge|flood)|1\.?5\s*f(ee)?t|2\s*f(ee)?t|road\s*(partially|partly)\s*flood|water\s*rising|getting\s*worse|slow\s*moving\s*traffic|difficult\s*(to\s*)?(pass|drive)/i,
  },
  {
    severity: 'low',
    patterns:
      /ankle[- ]?(deep|level|high)|minor\s*flood|shallow|small\s*puddle|light\s*flood|rain(y|ing)?|wet\s*road|standing\s*water|slight(ly)?\s*(flood|wet)|barely|puddle|drizzle|little\s*(flood|water)|low[- ]?level|surface\s*water|water\s*on\s*(the\s*)?road|passable|no\s*immediate\s*danger|minor\s*water/i,
  },
];

const SEVERITY_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

/**
 * Infer a severity level from free-text AI image notes.
 * Returns null when no keywords match.
 */
export function inferSeverityFromNotes(notes: string | null): Severity | null {
  if (!notes) return null;
  for (const { severity, patterns } of SEVERITY_KEYWORDS) {
    if (patterns.test(notes)) return severity;
  }
  return null;
}

/**
 * Check whether two severity levels are "close enough" (within ±1 rank).
 */
export function severityMatches(reported: Severity, inferred: Severity): boolean {
  return Math.abs(SEVERITY_RANK[reported] - SEVERITY_RANK[inferred]) <= 1;
}

/**
 * Numeric rank for comparisons (0 = low … 3 = critical).
 */
export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

/**
 * Human-readable label for a severity.
 */
export function severityLabel(s: Severity): string {
  return SEVERITY_LABELS[s];
}
