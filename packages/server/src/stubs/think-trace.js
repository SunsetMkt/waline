/**
 * think-trace stub for Cloudflare Workers.
 *
 * The real think-trace reads HTML error-page templates from disk using
 * `__dirname`, which is not available inside esbuild's CJS wrappers when
 * bundling for browser/Workers targets.  In a Workers deployment we do not
 * want detailed stack-trace HTML pages exposed to clients anyway.
 *
 * This stub exports a Koa-compatible middleware factory that simply calls
 * `next()`, delegating all error handling to Koa's default error handler.
 */

'use strict';

module.exports = function thinkTrace(_opts, _app) {
  return (ctx, next) => next();
};
