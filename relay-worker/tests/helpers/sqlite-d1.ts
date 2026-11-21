// A minimal D1Database over Node's built-in SQLite (node:sqlite), so
// tests run the worker's real SQL against a real SQLite engine — the
// same engine D1 uses — instead of asserting on query strings.
//
// It also counts traffic: `roundTrips` is what each D1 call costs the
// worker (one per prepare().first/all/run, one per batch()), and
// `queries` counts individual statements.

import { DatabaseSync } from 'node:sqlite';

export interface D1Stats {
  roundTrips: number;
  queries: number;
  sql: string[];
}

type Bindable = null | number | bigint | string | Uint8Array;

function returnsRows(sql: string): boolean {
  return /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql);
}

export function sqliteD1(sqlite: DatabaseSync = new DatabaseSync(':memory:')): {
  db: D1Database;
  sqlite: DatabaseSync;
  stats: D1Stats;
} {
  const stats: D1Stats = { roundTrips: 0, queries: 0, sql: [] };

  const execute = (sql: string, args: Bindable[]) => {
    stats.queries += 1;
    stats.sql.push(sql.replace(/\s+/g, ' ').trim());
    const stmt = sqlite.prepare(sql);
    if (returnsRows(sql)) return { results: stmt.all(...args) as Record<string, unknown>[], changes: 0, lastRowId: 0 };
    const r = stmt.run(...args);
    return { results: [] as Record<string, unknown>[], changes: Number(r.changes), lastRowId: Number(r.lastInsertRowid) };
  };

  const toResult = (r: ReturnType<typeof execute>) => ({
    success: true,
    results: r.results,
    meta: { changes: r.changes, last_row_id: r.lastRowId },
  });

  const statement = (sql: string, args: Bindable[] = []) => ({
    sql,
    args,
    bind: (...bound: unknown[]) => statement(sql, bound as Bindable[]),
    first: async (column?: string) => {
      stats.roundTrips += 1;
      const row = execute(sql, args).results[0] ?? null;
      return column && row ? row[column] : row;
    },
    all: async () => {
      stats.roundTrips += 1;
      return toResult(execute(sql, args));
    },
    run: async () => {
      stats.roundTrips += 1;
      return toResult(execute(sql, args));
    },
  });

  const db = {
    prepare: (sql: string) => statement(sql),
    // D1 runs a batch as one transaction in one round trip.
    batch: async (statements: Array<ReturnType<typeof statement>>) => {
      stats.roundTrips += 1;
      sqlite.exec('BEGIN');
      try {
        const out = statements.map((s) => toResult(execute(s.sql, s.args)));
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { db: db as unknown as D1Database, sqlite, stats };
}

/** SQLite's plan for a statement, e.g. "SEARCH symbol_cache USING INDEX idx_x (name=?)". */
export function queryPlan(sqlite: DatabaseSync, sql: string, args: Bindable[] = []): string {
  const rows = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as Array<{ detail: string }>;
  return rows.map((r) => r.detail).join(' | ');
}
