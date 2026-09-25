import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { D1Storage } from './storage/d1.js';
import { getConfig } from './config.js';
import { verifyToken } from './auth.js';
import { getAvatarUrl } from './avatar.js';
import { comment } from './routes/comment.js';
import { token } from './routes/token.js';
import { user } from './routes/user.js';
import { article } from './routes/article.js';

/**
 * Create and configure the Hono application.
 * Accepts an optional env override for testing (pass a mock env object with DB, JWT_TOKEN, etc.)
 */
export function createApp(envOverride = null) {
  const app = new Hono();

  // CORS middleware
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['x-waline-version'],
    }),
  );

  // Config, DB binding, and auth middleware
  app.use('*', async (c, next) => {
    const env = envOverride || c.env || {};
    const config = getConfig(env);
    c.set('config', config);
    // Expose the D1 binding (or mock) via context so routes don't need c.env directly
    c.set('db', env.DB);

    // Load user info from JWT
    const authorization = c.req.header('authorization');
    const stateToken = c.req.query('state');
    const rawToken =
      stateToken || (authorization ? authorization.replace(/^Bearer /, '') : null);

    c.set('userInfo', null);

    if (rawToken && config.jwtKey) {
      const userId = verifyToken(rawToken, config.jwtKey);
      if (userId) {
        const db = env.DB;
        if (db) {
          const userStorage = new D1Storage('Users', db);
          const users = await userStorage.select(
            { objectId: userId, type: ['!=', 'banned'] },
            {
              field: [
                'id',
                'email',
                'url',
                'display_name',
                'type',
                'avatar',
                'label',
              ],
            },
          );
          if (users.length > 0) {
            const u = users[0];
            u.avatar =
              u.avatar ||
              getAvatarUrl(
                { mail: u.email, nick: u.display_name },
                { avatarProxy: config.avatarProxy },
              );
            c.set('userInfo', u);
          }
        }
      }
    }

    await next();
  });

  // API version header
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('x-waline-version', '1.0.0');
  });

  // Mount routes under /api
  app.route('/api/comment', comment);
  app.route('/api/token', token);
  app.route('/api/user', user);
  app.route('/api/article', article);

  // Health check
  app.get('/', (c) => c.text('Waline Workers is running'));

  return app;
}
