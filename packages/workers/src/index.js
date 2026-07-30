/**
 * Cloudflare Workers entry point for Waline comment system.
 * Uses Hono framework with Cloudflare D1 database.
 */
import { createApp } from './app.js';

const app = createApp();

export default app;
