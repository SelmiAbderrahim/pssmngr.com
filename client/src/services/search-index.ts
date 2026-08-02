// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Client-Side Encrypted Search Index
 *
 * Builds an inverted index over decrypted vault item fields.
 * The index lives only in memory in plaintext form — it is
 * serialized, encrypted with the vault key, and synced to the
 * server as an opaque blob.
 *
 * Design goals:
 *  - < 100ms search for 5,000 items
 *  - Prefix matching for partial queries
 *  - Case-insensitive
 *  - Multi-term AND matching
 *  - No search queries ever sent to server
 */

// ── Types ──────────────────────────────────────────────────────────

/** Fields extracted from a decrypted vault item for indexing. */
export interface IndexableItem {
  id: string;
  fields: Record<string, string>;
}

interface SerializedIndex {
  v: 1;
  /** term → itemId[] */
  entries: Array<[string, string[]]>;
  /** itemId → term[] (reverse lookup for removal) */
  itemTerms: Array<[string, string[]]>;
}

// ── Tokenizer ──────────────────────────────────────────────────────

const MIN_TOKEN_LENGTH = 2;

/**
 * Tokenize a string into lowercase terms.
 * Splits on whitespace and common separators, filters short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_.,;:@/\\|!?#()[\]{}'"<>+=%&*^~`]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

/**
 * Generate prefixes for a token (for prefix matching).
 * E.g. "github" → ["gi", "git", "gith", "githu", "github"]
 */
function prefixes(token: string): string[] {
  const result: string[] = [];
  for (let i = MIN_TOKEN_LENGTH; i <= token.length; i++) {
    result.push(token.slice(0, i));
  }
  return result;
}

// ── SearchIndex ────────────────────────────────────────────────────

export class SearchIndex {
  /** term → Set<itemId> */
  private index = new Map<string, Set<string>>();
  /** itemId → Set<term> (for efficient removal) */
  private itemTerms = new Map<string, Set<string>>();

  /** Number of indexed items. */
  get size(): number {
    return this.itemTerms.size;
  }

  /**
   * Add or update an item in the index.
   * Extracts all field values, tokenizes, and indexes with prefixes.
   */
  addItem(itemId: string, fields: Record<string, string>): void {
    // Remove existing entry first (idempotent update)
    this.removeItem(itemId);

    const terms = new Set<string>();

    for (const value of Object.values(fields)) {
      if (!value) continue;
      const tokens = tokenize(value);
      for (const token of tokens) {
        for (const prefix of prefixes(token)) {
          terms.add(prefix);
        }
      }
    }

    // Store reverse mapping
    this.itemTerms.set(itemId, terms);

    // Add to inverted index
    for (const term of terms) {
      let ids = this.index.get(term);
      if (!ids) {
        ids = new Set();
        this.index.set(term, ids);
      }
      ids.add(itemId);
    }
  }

  /**
   * Remove an item from the index.
   */
  removeItem(itemId: string): void {
    const terms = this.itemTerms.get(itemId);
    if (!terms) return;

    for (const term of terms) {
      const ids = this.index.get(term);
      if (ids) {
        ids.delete(itemId);
        if (ids.size === 0) this.index.delete(term);
      }
    }

    this.itemTerms.delete(itemId);
  }

  /**
   * Search the index with a query string.
   *
   * Multi-term queries use AND matching — an item must match
   * all terms. Each term matches via prefix (so "git" matches
   * "github", "gitlab", etc.).
   *
   * Returns matching item IDs ranked by number of term matches
   * (items matching more unique terms rank higher).
   */
  search(query: string): string[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    let resultSet: Set<string> | null = null;

    for (const term of queryTerms) {
      const matches = this.index.get(term);
      if (!matches || matches.size === 0) {
        // AND semantics: if any term has no matches, result is empty
        return [];
      }

      if (resultSet === null) {
        resultSet = new Set(matches);
      } else {
        // Intersect with previous results
        for (const id of resultSet) {
          if (!matches.has(id)) resultSet.delete(id);
        }
      }

      if (resultSet.size === 0) return [];
    }

    if (!resultSet) return [];

    // Rank by relevance: count how many distinct query terms each item matches
    if (queryTerms.length > 1) {
      const scores = new Map<string, number>();
      for (const id of resultSet) {
        let score = 0;
        for (const term of queryTerms) {
          if (this.index.get(term)?.has(id)) score++;
        }
        scores.set(id, score);
      }

      return [...resultSet].sort(
        (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0),
      );
    }

    return [...resultSet];
  }

  /** Clear all entries. */
  clear(): void {
    this.index.clear();
    this.itemTerms.clear();
  }

  // ── Serialization ──────────────────────────────────────────────

  /** Serialize the index to a Uint8Array for encryption. */
  serialize(): Uint8Array {
    const data: SerializedIndex = {
      v: 1,
      entries: [...this.index.entries()].map(([term, ids]) => [
        term,
        [...ids],
      ]),
      itemTerms: [...this.itemTerms.entries()].map(([id, terms]) => [
        id,
        [...terms],
      ]),
    };

    return new TextEncoder().encode(JSON.stringify(data));
  }

  /** Deserialize a Uint8Array back into a SearchIndex. */
  static deserialize(data: Uint8Array): SearchIndex {
    const json = new TextDecoder().decode(data);
    const parsed: SerializedIndex = JSON.parse(json);

    if (parsed.v !== 1) {
      throw new Error(`Unsupported search index version: ${parsed.v}`);
    }

    const idx = new SearchIndex();

    for (const [term, ids] of parsed.entries) {
      idx.index.set(term, new Set(ids));
    }

    for (const [id, terms] of parsed.itemTerms) {
      idx.itemTerms.set(id, new Set(terms));
    }

    return idx;
  }
}

// ── Helper: extract searchable fields from a decrypted item ──────

const SEARCHABLE_KEYS = [
  "title",
  "name",
  "username",
  "email",
  "url",
  "fullName",
  "content",
  "notes",
  "issuer",
  "cardholderName",
] as const;

/**
 * Extract searchable text fields from a decrypted vault item.
 * Only includes string values from known searchable keys.
 */
export function extractSearchableFields(
  decrypted: Record<string, unknown>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of SEARCHABLE_KEYS) {
    const val = decrypted[key];
    if (typeof val === "string" && val.trim()) {
      fields[key] = val;
    }
  }
  return fields;
}
