/**
 * Search query helpers for audio file filtering (R9).
 *
 * Provides pure TypeScript utilities to trim, normalize, and escape search queries
 * for PostgreSQL ILIKE matching and in-memory substring filtering.
 */

export type EmptySearchQuery = {
  empty: true;
};

export type ActiveSearchQuery = {
  empty: false;
  /**
   * The SQL ILIKE pattern wrapped in `%` wildcards with special characters escaped.
   * e.g. "foo%bar" -> "%foo\\%bar%"
   */
  pattern: string;
  /**
   * The trimmed user query.
   */
  term: string;
  /**
   * The trimmed, lowercased user query for case-insensitive comparisons.
   */
  normalized: string;
};

export type SearchQueryResult = EmptySearchQuery | ActiveSearchQuery;

/**
 * Escapes characters that have special meaning in SQL LIKE/ILIKE patterns:
 * - Backslash (\) -> \\
 * - Percent (%) -> \%
 * - Underscore (_) -> \_
 *
 * Backslash is escaped first to avoid double-escaping subsequent substitutions.
 */
export function escapeIlikePattern(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Parses and validates a raw search query string.
 *
 * If the query is empty or contains only whitespace, returns `{ empty: true }`.
 * Otherwise, returns an ActiveSearchQuery containing the escaped ILIKE pattern,
 * trimmed term, and normalized (lowercased) representation.
 */
export function parseSearchQuery(
  rawQuery: string | null | undefined,
): SearchQueryResult {
  if (rawQuery == null) {
    return { empty: true };
  }

  const term = rawQuery.trim();
  if (term.length === 0) {
    return { empty: true };
  }

  return {
    empty: false,
    pattern: `%${escapeIlikePattern(term)}%`,
    term,
    normalized: term.toLowerCase(),
  };
}

/**
 * Evaluates whether a filename matches a given query in-memory.
 *
 * Follows the R9 contract:
 * - Blank/empty query matches all filenames (returns true).
 * - Case-insensitive substring match against filename.
 */
export function matchesSearchQuery(
  filename: string,
  query: string | null | undefined,
): boolean {
  const parsed = parseSearchQuery(query);
  if (parsed.empty) {
    return true;
  }
  return filename.toLowerCase().includes(parsed.normalized);
}
