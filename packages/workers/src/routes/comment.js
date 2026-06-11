import { Hono } from 'hono';
import { D1Storage } from '../storage/d1.js';
import { getAvatarUrl } from '../avatar.js';
import { createMarkdownParser } from '../markdown.js';

const comment = new Hono();

/**
 * Helper: get storage instance from context
 */
function getStorage(c, tableName) {
  return new D1Storage(tableName, c.get('db'));
}

/**
 * Format a comment for API response.
 * Reuses the same formatting logic as packages/server/src/controller/comment.js
 */
async function formatComment(cmt, users = [], config = {}, loginUser = null) {
  const { avatarProxy = '', disableUserAgent = false, disableRegion = false } = config;
  const { ua, ip, ...comment } = cmt;

  // Set browser/OS from UA
  if (!disableUserAgent && ua) {
    // Simple UA parsing without ua-parser-js (avoid heavy dep in Workers)
    comment.browser = parseUA(ua);
    comment.os = parseOS(ua);
  }

  // Apply registered user info
  const user = users.find(({ objectId }) => cmt.user_id === objectId);
  if (user) {
    comment.nick = user.display_name;
    comment.mail = user.email;
    comment.link = user.url;
    comment.type = user.type;
    comment.label = user.label;
  }

  // Avatar
  comment.avatar = getAvatarUrl(
    { mail: comment.mail, nick: comment.nick, avatar: user?.avatar },
    { avatarProxy },
  );

  const isAdmin = loginUser?.type === 'administrator';

  // Include original markdown if user is logged in
  if (loginUser) {
    comment.orig = comment.comment;
  }

  // Hide email from non-admins; show IP to admins only
  if (!isAdmin) {
    delete comment.mail;
  } else {
    comment.ip = ip;
  }

  // Parse markdown
  const markdownParser = createMarkdownParser();
  comment.comment = markdownParser(comment.comment || '');
  comment.like = Number(comment.like) || 0;

  if (typeof comment.sticky === 'string') {
    comment.sticky = Boolean(Number(comment.sticky));
  }

  comment.time = comment.insertedAt ? new Date(comment.insertedAt).getTime() : Date.now();
  delete comment.createdAt;
  delete comment.updatedAt;

  return comment;
}

/** Very simple UA to browser name */
function parseUA(ua) {
  if (!ua) return '';
  if (/Firefox\/([\d.]+)/.test(ua)) return `Firefox ${RegExp.$1.split('.').slice(0, 2).join('.')}`;
  if (/Edg\/([\d.]+)/.test(ua)) return `Edge ${RegExp.$1.split('.').slice(0, 2).join('.')}`;
  if (/Chrome\/([\d.]+)/.test(ua)) return `Chrome ${RegExp.$1.split('.').slice(0, 2).join('.')}`;
  if (/Safari\/([\d.]+)/.test(ua)) return `Safari ${RegExp.$1.split('.').slice(0, 2).join('.')}`;
  return '';
}

/** Very simple UA to OS name */
function parseOS(ua) {
  if (!ua) return '';
  if (/Windows NT 10/.test(ua)) return 'Windows 10';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X ([\d_]+)/.test(ua)) return `macOS ${RegExp.$1.replace(/_/g, '.')}`;
  if (/Android ([\d.]+)/.test(ua)) return `Android ${RegExp.$1}`;
  if (/iPhone OS ([\d_]+)/.test(ua)) return `iOS ${RegExp.$1.replace(/_/g, '.')}`;
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

/**
 * GET /api/comment
 * Supports: type=list (admin), type=count, type=recent, default (comment list for page)
 */
comment.get('/', async (c) => {
  const query = c.req.query();
  const {
    type,
    page = '1',
    pageSize = '10',
    sortBy = 'insertedAt_desc',
    owner,
    keyword,
    status,
  } = query;
  // Support repeated url params: ?url=/a&url=/b
  const urlParam = c.req.queries('url') || (query.url ? [query.url] : []);
  const url = urlParam.length === 1 ? urlParam[0] : urlParam;

  const commentStorage = getStorage(c, 'Comment');
  const userStorage = getStorage(c, 'Users');
  const config = c.get('config') || {};
  const loginUser = c.get('userInfo');
  const isAdmin = loginUser?.type === 'administrator';

  // Admin comment list
  if (type === 'list') {
    if (!isAdmin) {
      return c.json({ errno: 403, errmsg: 'Forbidden' }, 403);
    }

    const pageNum = Math.max(parseInt(page), 1);
    const pageSizeNum = Math.max(parseInt(pageSize), 1);

    const filter = {};
    if (keyword) filter.comment = ['LIKE', `%${keyword}%`];
    if (status) filter.status = status;
    if (owner && owner !== 'all') filter.user_id = owner;

    const [total, comments] = await Promise.all([
      commentStorage.count(filter),
      commentStorage.select(filter, {
        desc: 'insertedAt',
        limit: pageSizeNum,
        offset: (pageNum - 1) * pageSizeNum,
      }),
    ]);

    const [waitingCount, spamCount] = await Promise.all([
      commentStorage.count({ status: 'waiting' }),
      commentStorage.count({ status: 'spam' }),
    ]);

    const userIds = [...new Set(comments.map((c) => c.user_id).filter(Boolean))];
    const users = userIds.length
      ? await userStorage.select({ objectId: ['IN', userIds] })
      : [];

    const formatted = await Promise.all(
      comments.map((cmt) => formatComment(cmt, users, config, loginUser)),
    );

    return c.json({
      errno: 0,
      data: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
        spamCount,
        waitingCount,
        data: formatted,
      },
    });
  }

  // Count comments
  if (type === 'count') {
    const urls = Array.isArray(url) ? url : url ? [url] : [];
    if (urls.length === 0) {
      return c.json({ errno: 0, data: 0 });
    }

    const counts = await Promise.all(
      urls.map((u) => commentStorage.count({ url: u, status: 'approved' })),
    );
    const result = urls.length === 1 ? counts[0] : counts;

    return c.json({ errno: 0, data: result });
  }

  // Recent comments
  if (type === 'recent') {
    const limit = parseInt(pageSize) || 10;
    const comments = await commentStorage.select(
      { status: 'approved' },
      { desc: 'insertedAt', limit },
    );

    const userIds = [...new Set(comments.map((c) => c.user_id).filter(Boolean))];
    const users = userIds.length
      ? await userStorage.select({ objectId: ['IN', userIds] })
      : [];

    const formatted = await Promise.all(
      comments.map((cmt) => formatComment(cmt, users, config, loginUser)),
    );

    return c.json({ errno: 0, data: formatted });
  }

  // Default: get comment list for a page
  const urls = Array.isArray(url) ? url : url ? [url] : [];
  if (urls.length === 0) {
    return c.json({ errno: 0, data: { count: 0, data: [], page: 1, pageSize: 10, totalPages: 0 } });
  }

  const pageNum = Math.max(parseInt(page), 1);
  const pageSizeNum = Math.max(parseInt(pageSize), 1);
  const pageUrl = urls[0];

  // Sort options
  let sortField = 'insertedAt';
  let sortDir = 'DESC';
  if (sortBy === 'insertedAt_asc') {
    sortDir = 'ASC';
  } else if (sortBy === 'like_desc') {
    sortField = 'like';
  }

  const rootFilter = { url: pageUrl, rid: undefined, status: 'approved' };

  const [totalCount, rootComments] = await Promise.all([
    commentStorage.count({ url: pageUrl, status: 'approved' }),
    commentStorage.select(rootFilter, {
      desc: sortDir === 'DESC' ? sortField : undefined,
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
    }),
  ]);

  if (rootComments.length === 0) {
    return c.json({
      errno: 0,
      data: {
        count: totalCount,
        data: [],
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(totalCount / pageSizeNum),
      },
    });
  }

  // Load children (replies)
  const rootIds = rootComments.map((c) => c.objectId);
  const children = rootIds.length
    ? await commentStorage.select(
        { rid: ['IN', rootIds], status: 'approved' },
        { desc: 'insertedAt' },
      )
    : [];

  // Load users
  const allComments = [...rootComments, ...children];
  const userIds = [...new Set(allComments.map((c) => c.user_id).filter(Boolean))];
  const users = userIds.length
    ? await userStorage.select({ objectId: ['IN', userIds] })
    : [];

  // Format and nest
  const formattedChildren = await Promise.all(
    children.map((cmt) => formatComment(cmt, users, config, loginUser)),
  );

  const childByRid = {};
  for (const child of formattedChildren) {
    const rid = child.rid;
    if (!childByRid[rid]) childByRid[rid] = [];
    childByRid[rid].push(child);
  }

  const formattedRoot = await Promise.all(
    rootComments.map(async (cmt) => {
      const formatted = await formatComment(cmt, users, config, loginUser);
      formatted.children = childByRid[cmt.objectId] || [];
      return formatted;
    }),
  );

  return c.json({
    errno: 0,
    data: {
      count: totalCount,
      data: formattedRoot,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(totalCount / pageSizeNum),
    },
  });
});

/**
 * POST /api/comment
 * Create a new comment.
 */
comment.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { comment: content, link, mail, nick, pid, rid, ua, url, at } = body;
  const config = c.get('config') || {};
  const loginUser = c.get('userInfo');

  if (!content || !url) {
    return c.json({ errno: 400, errmsg: 'content and url are required' }, 400);
  }

  // Check forbidden words
  const { forbiddenWords = [] } = config;
  if (forbiddenWords.some((word) => content.includes(word))) {
    return c.json({ errno: 403, errmsg: 'Forbidden content' }, 403);
  }

  const commentStorage = getStorage(c, 'Comment');

  // Duplicate detection
  if (mail && nick) {
    const duplicate = await commentStorage.select({ url, mail, nick, comment: content });
    if (duplicate.length > 0) {
      return c.json({ errno: 400, errmsg: 'Duplicate Content' }, 400);
    }
  }

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';

  const data = {
    url,
    comment: content,
    link: link || '',
    mail: mail || '',
    nick: nick || 'Anonymous',
    pid: pid || null,
    rid: rid || null,
    ua: ua || '',
    ip,
    at: at || null,
    status: config.audit ? 'waiting' : 'approved',
    user_id: loginUser?.objectId || null,
    sticky: false,
    like: 0,
    insertedAt: new Date().toISOString(),
  };

  const created = await commentStorage.add(data);

  const userStorage = getStorage(c, 'Users');
  const users = loginUser
    ? await userStorage.select({ objectId: loginUser.objectId })
    : [];

  const formatted = await formatComment(created, users, config, loginUser);

  return c.json({ errno: 0, data: formatted });
});

/**
 * GET /api/comment/:id
 * Get a specific comment by ID.
 */
comment.get('/:id', async (c) => {
  const { id } = c.req.param();
  const commentStorage = getStorage(c, 'Comment');
  const config = c.get('config') || {};
  const loginUser = c.get('userInfo');

  const comments = await commentStorage.select({ objectId: id });
  if (comments.length === 0) {
    return c.json({ errno: 404, errmsg: 'Not Found' }, 404);
  }

  const userStorage = getStorage(c, 'Users');
  const users = comments[0].user_id
    ? await userStorage.select({ objectId: comments[0].user_id })
    : [];

  const formatted = await formatComment(comments[0], users, config, loginUser);

  return c.json({ errno: 0, data: formatted });
});

/**
 * PUT /api/comment/:id
 * Update a comment (admin or comment owner only).
 */
comment.put('/:id', async (c) => {
  const { id } = c.req.param();
  const loginUser = c.get('userInfo');

  if (!loginUser) {
    return c.json({ errno: 401, errmsg: 'Unauthorized' }, 401);
  }

  const commentStorage = getStorage(c, 'Comment');
  const existing = await commentStorage.select({ objectId: id });

  if (existing.length === 0) {
    return c.json({ errno: 404, errmsg: 'Not Found' }, 404);
  }

  const isAdmin = loginUser.type === 'administrator';
  const isOwner = existing[0].user_id === loginUser.objectId;

  if (!isAdmin && !isOwner) {
    return c.json({ errno: 403, errmsg: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const allowedFields = isAdmin
    ? ['comment', 'nick', 'mail', 'link', 'url', 'status', 'sticky', 'like']
    : ['comment', 'nick', 'mail', 'link'];

  const updateData = {};
  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ errno: 400, errmsg: 'No fields to update' }, 400);
  }

  const updated = await commentStorage.update(updateData, { objectId: id });

  return c.json({ errno: 0, data: updated[0] || null });
});

/**
 * DELETE /api/comment/:id
 * Delete a comment (admin or comment owner only).
 */
comment.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const loginUser = c.get('userInfo');

  if (!loginUser) {
    return c.json({ errno: 401, errmsg: 'Unauthorized' }, 401);
  }

  const commentStorage = getStorage(c, 'Comment');
  const existing = await commentStorage.select({ objectId: id });

  if (existing.length === 0) {
    return c.json({ errno: 404, errmsg: 'Not Found' }, 404);
  }

  const isAdmin = loginUser.type === 'administrator';
  const isOwner = existing[0].user_id === loginUser.objectId;

  if (!isAdmin && !isOwner) {
    return c.json({ errno: 403, errmsg: 'Forbidden' }, 403);
  }

  await commentStorage.delete({ objectId: id });

  // Also delete child comments
  await commentStorage.delete({ rid: id });

  return c.json({ errno: 0, data: null });
});

export { comment };
