/**
 * Minimal iconv-lite stub for Cloudflare Workers.
 *
 * The full iconv-lite@0.4.x package tries to load Node.js stream internals at
 * module-initialisation time.  Its package.json maps `./lib/streams` → false
 * for browser/worker targets, so esbuild replaces the require with `false`.
 * Calling `false(iconv)` at startup crashes the Worker.
 *
 * This stub provides only the subset of the iconv-lite API that is actually
 * called by `raw-body` (our only consumer):
 *   - `getDecoder(encoding)` → `{ write(buf): string, end(): string }`
 *
 * All encoding conversion is delegated to the global `TextDecoder` which is
 * natively available in the Workers runtime.
 */

'use strict';

/**
 * Return a streaming-style decoder that accumulates Buffer chunks and decodes
 * the full content on `end()`.
 */
function getDecoder(encoding) {
  const label = encoding || 'utf-8';
  let td;

  try {
    td = new TextDecoder(label);
  } catch {
    // Fall back to UTF-8 for unrecognised labels.
    td = new TextDecoder('utf-8');
  }

  const chunks = [];

  return {
    write(chunk) {
      if (chunk && chunk.length > 0) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      // Return empty string – we decode all at once in end().
      return '';
    },

    end() {
      const combined = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
      return td.decode(combined);
    },
  };
}

module.exports = {
  // Used by raw-body to decode request bodies.
  getDecoder,

  // Provide supportsEncoding so callers can test before using.
  supportsEncoding(encoding) {
    try {
      // eslint-disable-next-line no-new
      new TextDecoder(encoding);
      return true;
    } catch {
      return false;
    }
  },

  // Basic encode / decode used elsewhere in the stack.
  encode(str, encoding) {
    return Buffer.from(String(str), 'utf8');
  },

  decode(buf, encoding) {
    const label = encoding || 'utf-8';

    try {
      return new TextDecoder(label).decode(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    } catch {
      return new TextDecoder('utf-8').decode(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    }
  },

  // Streaming API stubs (not used by raw-body, included for completeness).
  supportsStreams: false,
  encodeStream: null,
  decodeStream: null,
};
