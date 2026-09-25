import jwt from 'jsonwebtoken';

const { sign, verify } = jwt;

/**
 * Create a JWT token for a user.
 */
export function createToken(userId, jwtKey) {
  return sign(String(userId), jwtKey);
}

/**
 * Verify a JWT token and return the user ID.
 * Returns null if the token is invalid.
 */
export function verifyToken(token, jwtKey) {
  try {
    const userId = verify(token, jwtKey);
    if (typeof userId === 'string' && userId) {
      return userId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Hono middleware to parse JWT from Authorization header and load user info.
 * Sets c.set('userInfo', user) or c.set('userInfo', null).
 */
export function authMiddleware(getUser) {
  return async (c, next) => {
    c.set('userInfo', null);

    const authorization = c.req.header('authorization');
    const stateToken = c.req.query('state');
    const token = stateToken || (authorization ? authorization.replace(/^Bearer /, '') : null);

    if (token) {
      const jwtKey = c.get('config')?.jwtKey || c.env?.JWT_TOKEN || '';
      const userId = verifyToken(token, jwtKey);

      if (userId) {
        const user = await getUser(userId, c);
        if (user) {
          c.set('userInfo', user);
        }
      }
    }

    await next();
  };
}

/**
 * Hash a password using phpass-compatible algorithm.
 */
export async function hashPassword(password) {
  const { PasswordHash } = await import('phpass');
  const pwdHash = new PasswordHash();
  return pwdHash.hashPassword(password);
}

/**
 * Check a password against a stored hash.
 */
export async function checkPassword(password, storedHash) {
  const { PasswordHash } = await import('phpass');
  const pwdHash = new PasswordHash();
  return pwdHash.checkPassword(password, storedHash);
}
