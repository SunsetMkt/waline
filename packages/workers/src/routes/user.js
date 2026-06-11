import { Hono } from 'hono';
import { D1Storage } from '../storage/d1.js';
import { getAvatarUrl } from '../avatar.js';
import { hashPassword } from '../auth.js';

const user = new Hono();

function getUserStorage(c) {
  return new D1Storage('Users', c.get('db'));
}

/**
 * GET /api/user
 * Get user list. Admin can get full list with pagination; others get public info.
 */
user.get('/', async (c) => {
  const { page = '1', pageSize = '10', email } = c.req.query();
  const loginUser = c.get('userInfo');
  const isAdmin = loginUser?.type === 'administrator';
  const config = c.get('config') || {};
  const userStorage = getUserStorage(c);

  // Admin: get specific user by email
  if (isAdmin && email) {
    const users = await userStorage.select({ email });
    if (users.length === 0) {
      return c.json({ errno: 0, data: null });
    }

    return c.json({ errno: 0, data: users[0] });
  }

  // Admin: get paginated user list
  if (isAdmin) {
    const pageNum = Math.max(parseInt(page), 1);
    const pageSizeNum = Math.max(parseInt(pageSize), 1);

    const [total, users] = await Promise.all([
      userStorage.count({}),
      userStorage.select(
        {},
        {
          desc: 'createdAt',
          limit: pageSizeNum,
          offset: (pageNum - 1) * pageSizeNum,
        },
      ),
    ]);

    const withAvatars = users.map((u) => ({
      ...u,
      avatar: getAvatarUrl(
        { mail: u.email, nick: u.display_name, avatar: u.avatar },
        { avatarProxy: config.avatarProxy },
      ),
    }));

    return c.json({
      errno: 0,
      data: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
        data: withAvatars,
      },
    });
  }

  // Non-admin: return comment-count-based user list (public info only)
  const commentStorage = new D1Storage('Comment', c.get('db'));
  const userCounts = await commentStorage.count({ status: 'approved' }, { group: ['user_id'] });

  const topUserIds = userCounts
    .filter((row) => row.user_id)
    .sort((a, b) => b.count - a.count)
    .slice(0, parseInt(pageSize) || 10)
    .map((row) => row.user_id);

  if (topUserIds.length === 0) {
    return c.json({ errno: 0, data: [] });
  }

  const users = await userStorage.select({ objectId: ['IN', topUserIds] });

  const publicUsers = users.map((u) => ({
    objectId: u.objectId,
    display_name: u.display_name,
    url: u.url,
    avatar: getAvatarUrl(
      { mail: u.email, nick: u.display_name, avatar: u.avatar },
      { avatarProxy: config.avatarProxy },
    ),
    type: u.type,
    label: u.label,
    count: userCounts.find((uc) => uc.user_id === u.objectId)?.count || 0,
  }));

  return c.json({ errno: 0, data: publicUsers });
});

/**
 * POST /api/user
 * Register a new user or re-register a guest.
 */
user.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { display_name, email, password, url } = body;

  if (!display_name || !email || !password) {
    return c.json({ errno: 400, errmsg: 'display_name, email, and password are required' }, 400);
  }

  const userStorage = getUserStorage(c);
  const existing = await userStorage.select({ email });

  // Don't allow re-registering administrator or verified guest accounts
  if (existing.length > 0 && ['administrator', 'guest'].includes(existing[0].type)) {
    return c.json({ errno: 409, errmsg: 'User already exists' }, 409);
  }

  const count = await userStorage.count({});
  const hashedPassword = await hashPassword(password);

  const userData = {
    display_name,
    email,
    password: hashedPassword,
    url: url || '',
    // First user becomes administrator
    type: count === 0 ? 'administrator' : 'guest',
  };

  if (existing.length > 0) {
    await userStorage.update(userData, { email });
  } else {
    await userStorage.add(userData);
  }

  return c.json({ errno: 0, data: null });
});

/**
 * PUT /api/user/:id
 * Update user profile. Admin can update any user; users can update their own profile.
 */
user.put('/:id', async (c) => {
  const { id } = c.req.param();
  const loginUser = c.get('userInfo');

  if (!loginUser) {
    return c.json({ errno: 401, errmsg: 'Unauthorized' }, 401);
  }

  const isAdmin = loginUser.type === 'administrator';
  const isSelf = loginUser.objectId === id;

  if (!isAdmin && !isSelf) {
    return c.json({ errno: 403, errmsg: 'Forbidden' }, 403);
  }

  const userStorage = getUserStorage(c);
  const existing = await userStorage.select({ objectId: id });

  if (existing.length === 0) {
    return c.json({ errno: 404, errmsg: 'Not Found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  const adminFields = ['type', 'label', 'github', 'twitter', 'facebook', 'google', 'weibo', 'qq'];
  const selfFields = ['display_name', 'url', 'avatar', 'password'];

  const updateData = {};

  for (const field of selfFields) {
    if (field in body) {
      if (field === 'password') {
        updateData.password = await hashPassword(body.password);
      } else {
        updateData[field] = body[field];
      }
    }
  }

  if (isAdmin) {
    for (const field of adminFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ errno: 400, errmsg: 'No fields to update' }, 400);
  }

  const updated = await userStorage.update(updateData, { objectId: id });

  return c.json({ errno: 0, data: updated[0] || null });
});

/**
 * DELETE /api/user/:id
 * Delete a user (admin only).
 */
user.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const loginUser = c.get('userInfo');

  if (!loginUser || loginUser.type !== 'administrator') {
    return c.json({ errno: 403, errmsg: 'Forbidden' }, 403);
  }

  const userStorage = getUserStorage(c);
  await userStorage.delete({ objectId: id });

  return c.json({ errno: 0, data: null });
});

export { user };
