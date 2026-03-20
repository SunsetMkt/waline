/**
 * any-promise stub for Cloudflare Workers.
 *
 * The `any-promise` package has a browser field that maps `./register.js` to
 * `./register-shim.js`, which uses `window.Promise`.  Cloudflare Workers do
 * not expose `window`, so this crashes at startup.
 *
 * This stub simply exports the global `Promise` (always available in Workers).
 */

'use strict';

module.exports = Promise;
