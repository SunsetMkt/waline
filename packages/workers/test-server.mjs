/**
 * Local test server for Waline Workers.
 * Uses @hono/node-server to run the Hono app in Node.js with an in-memory D1 mock.
 * Usage: node test-server.mjs [port]
 */
import { serve } from '@hono/node-server';
import { createApp } from './src/app.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || process.argv[2] || 8787;

// Initialize in-memory SQLite database (D1-compatible)
const db = new Database(':memory:');
const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Wrap better-sqlite3 with D1's async API
function wrapD1(sqliteDb) {
  return {
    prepare(sql) {
      let _params = [];
      return {
        bind(...params) {
          _params = params;
          return this;
        },
        async all() {
          const prepared = sqliteDb.prepare(sql);
          return { results: prepared.all(..._params) || [] };
        },
        async run() {
          const prepared = sqliteDb.prepare(sql);
          const info = prepared.run(..._params);
          return {
            meta: { last_row_id: info.lastInsertRowid, changes: info.changes },
            success: true,
          };
        },
        async first() {
          const prepared = sqliteDb.prepare(sql);
          return prepared.get(..._params) ?? null;
        },
      };
    },
  };
}

const mockDB = wrapD1(db);
const JWT_TOKEN = process.env.JWT_TOKEN || 'waline-workers-test-secret';

const app = createApp({ DB: mockDB, JWT_TOKEN });

serve({ fetch: app.fetch, port: Number(PORT) }, (info) => {
  console.log(`\n🚀 Waline Workers test server running at http://localhost:${info.port}`);
  console.log('   Try: curl http://localhost:' + info.port + '/api/comment?url=/test');
  console.log('   Stop with Ctrl+C\n');
});
