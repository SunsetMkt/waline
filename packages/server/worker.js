/**
 * Cloudflare Workers entry point for Waline.
 *
 * Build with wrangler (esbuild) so all `require()` calls are resolved at
 * bundle time.  At runtime the worker converts the incoming Web-API Request
 * into Node.js-compatible objects and delegates to the existing ThinkJS
 * application via its standard `(req, res)` handler.
 *
 * The Cloudflare D1 binding is forwarded to ThinkJS config so that the
 * `cloudflare-d1` storage adapter can access it.
 */

import { Readable } from 'node:stream';

import main from './index.js';

let handler = null;

/**
 * Create a minimal Node.js IncomingMessage-compatible object from a Web API
 * Request so that Koa (used internally by ThinkJS) can process it.
 */
function createNodeRequest(webRequest, url, bodyBuffer) {
  const readable = new Readable({
    read() {
      if (bodyBuffer && bodyBuffer.byteLength > 0) {
        this.push(Buffer.from(bodyBuffer));
      }
      this.push(null);
    },
  });

  return Object.assign(readable, {
    method: webRequest.method.toUpperCase(),
    url: url.pathname + url.search,
    headers: Object.fromEntries(webRequest.headers.entries()),
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    connection: { encrypted: url.protocol === 'https:' },
    socket: {
      remoteAddress:
        webRequest.headers.get('cf-connecting-ip') ||
        webRequest.headers.get('x-forwarded-for') ||
        '127.0.0.1',
      encrypted: url.protocol === 'https:',
    },
    complete: false,
    aborted: false,
    destroy() {},
  });
}

/**
 * Create a minimal Node.js ServerResponse-compatible object.  When `end()`
 * is called the promise returned by `getResponsePromise()` resolves with the
 * fully-formed Web API Response.
 */
function createNodeResponse() {
  const chunks = [];
  const headers = {};
  let statusCode = 200;
  let resolveResponse;

  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const res = {
    statusCode,
    headersSent: false,
    finished: false,
    writable: true,

    setHeader(name, value) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    },

    getHeader(name) {
      return headers[name.toLowerCase()];
    },

    getHeaders() {
      return { ...headers };
    },

    hasHeader(name) {
      return name.toLowerCase() in headers;
    },

    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },

    writeHead(code, message, hdrs) {
      if (typeof message === 'object' && message !== null) {
        hdrs = message;
      }
      statusCode = code;
      res.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          res.setHeader(k, v);
        }
      }
      res.headersSent = true;
    },

    write(data, encoding, callback) {
      if (data) {
        chunks.push(typeof data === 'string' ? Buffer.from(data, encoding) : Buffer.from(data));
      }
      if (typeof callback === 'function') callback();
      return true;
    },

    end(data, encoding, callback) {
      if (data) {
        chunks.push(typeof data === 'string' ? Buffer.from(data, encoding) : Buffer.from(data));
      }
      res.finished = true;
      res.writable = false;

      const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      resolveResponse(new Response(body, { status: statusCode, headers }));

      if (typeof callback === 'function') callback();
    },

    // Minimal event emitter stubs required by Koa internals.
    on() {
      return res;
    },
    once() {
      return res;
    },
    emit() {
      return false;
    },
    destroy() {},
  };

  return { res, responsePromise };
}

export default {
  async fetch(request, env, _ctx) {
    // Lazily initialise the ThinkJS application on the first request.
    if (!handler) {
      handler = main({ env: 'cloudflare' });
    }

    // Expose the D1 binding and table prefix via ThinkJS config so the
    // cloudflare-d1 storage adapter can reach them.
    if (env.D1) {
      think.config('d1Database', env.D1);
    }
    if (env.D1_PREFIX) {
      think.config('d1Prefix', env.D1_PREFIX);
    }

    const url = new URL(request.url);
    const bodyBuffer =
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : null;

    const nodeReq = createNodeRequest(request, url, bodyBuffer);
    const { res: nodeRes, responsePromise } = createNodeResponse();

    handler(nodeReq, nodeRes).catch((err) => {
      think.logger.error(err);
      if (!nodeRes.finished) {
        nodeRes.writeHead(500);
        nodeRes.end('Internal Server Error');
      }
    });

    return responsePromise;
  },
};
