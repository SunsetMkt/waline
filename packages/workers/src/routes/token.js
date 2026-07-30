import { Hono } from 'hono';
import { D1Storage } from '../storage/d1.js';
import { getAvatarUrl } from '../avatar.js';
import { createToken, verifyToken, hashPassword, checkPassword } from '../auth.js';

const token = new Hono();

function getUserStorage(c) {
  return new D1Storage('Users', c.get('db'));
}

/**
 * GET /api/token
 * Return current user info from JWT.
 */
token.get('/', async (c) => {
  const loginUser = c.get('userInfo');

  if (!loginUser) {
    return c.json({ errno: 0, data: null });
  }

  return c.json({ errno: 0, data: loginUser });
});

/**
 * POST /api/token
 * Login: verify email/password and return JWT token.
 */
token.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ errno: 400, errmsg: 'email and password required' }, 400);
  }

  const userStorage = getUserStorage(c);
  const users = await userStorage.select({ email });

  if (users.length === 0) {
    return c.json({ errno: 401, errmsg: 'Login failed' }, 401);
  }

  const user = users[0];

  // Reject unverified or banned users
  if (/^verify:/i.test(user.type) || user.type === 'banned') {
    return c.json({ errno: 401, errmsg: 'Login failed' }, 401);
  }

  const valid = await checkPassword(password, user.password);
  if (!valid) {
    return c.json({ errno: 401, errmsg: 'Login failed' }, 401);
  }

  const jwtKey = c.get('config')?.jwtKey || '';
  const config = c.get('config') || {};

  const avatarUrl = getAvatarUrl(
    { mail: user.email, nick: user.display_name, avatar: user.avatar },
    { avatarProxy: config.avatarProxy },
  );

  const responseUser = {
    ...user,
    avatar: avatarUrl,
    password: null,
    token: createToken(user.objectId, jwtKey),
  };

  return c.json({ errno: 0, data: responseUser });
});

/**
 * DELETE /api/token
 * Logout (client-side token invalidation - server is stateless).
 */
token.delete('/', async (c) => {
  return c.json({ errno: 0, data: null });
});

export { token };
