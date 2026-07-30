/**
 * D1-compatible wrapper around better-sqlite3 for use in Vitest tests.
 * Cloudflare D1 is SQLite-based, so this gives accurate test behavior.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create an in-memory D1-compatible database with the Waline schema applied.
 * @returns {Object} D1-compatible db object
 */
export function createD1Mock() {
  const db = new Database(':memory:');

  // Apply the schema
  const schemaPath = resolve(__dirname, '../../schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  db.exec(schema);

  return wrapD1(db);
}

/**
 * Wrap a better-sqlite3 database to match Cloudflare D1's async API.
 */
function wrapD1(db) {
  return {
    prepare(sql) {
      let _params = [];

      const stmt = {
        bind(...params) {
          _params = params;
          return this;
        },
        async all() {
          try {
            const prepared = db.prepare(sql);
            const results = prepared.all(..._params);
            return { results: results || [] };
          } catch (err) {
            throw new Error(`D1 query failed: ${sql}\n${err.message}`);
          }
        },
        async run() {
          try {
            const prepared = db.prepare(sql);
            const info = prepared.run(..._params);
            return {
              meta: {
                last_row_id: info.lastInsertRowid,
                changes: info.changes,
              },
              success: true,
            };
          } catch (err) {
            throw new Error(`D1 query failed: ${sql}\n${err.message}`);
          }
        },
        async first() {
          try {
            const prepared = db.prepare(sql);
            const result = prepared.get(..._params);
            return result ?? null;
          } catch (err) {
            throw new Error(`D1 query failed: ${sql}\n${err.message}`);
          }
        },
      };

      return stmt;
    },

    // Helper to run raw SQL for test setup
    _raw: db,
  };
}
