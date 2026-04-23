import { Hono } from 'hono';
import { D1Storage } from '../storage/d1.js';

const article = new Hono();

function getStorage(c) {
  return new D1Storage('Counter', c.get('db'));
}

/**
 * GET /api/article
 * Get article view/like counts for one or more URLs.
 */
article.get('/', async (c) => {
  // Support both single and repeated query params (e.g. ?path=/a&path=/b or ?type=time&type=like)
  const pathParam = c.req.queries('path') || [c.req.query('path')].filter(Boolean);
  const typeParam = c.req.queries('type') || [c.req.query('type') || 'time'];

  const paths = pathParam.filter(Boolean);
  const types = typeParam.filter(Boolean);

  if (paths.length === 0) {
    return c.json({ errno: 0, data: 0 });
  }

  const counterStorage = getStorage(c);
  const resp = await counterStorage.select({ url: ['IN', paths] });

  if (resp.length === 0) {
    const emptyCounters = paths.map(() =>
      types.reduce((o, field) => {
        o[field] = 0;
        return o;
      }, {}),
    );
    const result = paths.length === 1 ? emptyCounters[0] : emptyCounters;
    return c.json({ errno: 0, data: result });
  }

  const respObj = resp.reduce((o, n) => {
    o[n.url] = n;
    return o;
  }, {});

  const data = paths.map((url) => {
    return types.reduce((o, field) => {
      o[field] = respObj[url]?.[field] ?? 0;
      return o;
    }, {});
  });

  const result = paths.length === 1 ? data[0] : data;
  return c.json({ errno: 0, data: result });
});

/**
 * POST /api/article
 * Increment view or like count for an article.
 */
article.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { path, type = 'time', action = 'inc' } = body;

  if (!path) {
    return c.json({ errno: 400, errmsg: 'path is required' }, 400);
  }

  const counterStorage = getStorage(c);
  const resp = await counterStorage.select({ url: path });

  if (resp.length === 0) {
    if (action === 'desc') {
      return c.json({ errno: 0, data: [{ [type]: 0 }] });
    }

    const count = 1;
    await counterStorage.add({ url: path, [type]: count });
    return c.json({ errno: 0, data: [{ [type]: count }] });
  }

  const updated = await counterStorage.update(
    (counter) => ({
      [type]: action === 'desc' ? Math.max((counter[type] || 1) - 1, 0) : (counter[type] || 0) + 1,
      updatedAt: new Date().toISOString(),
    }),
    { objectId: ['IN', resp.map(({ objectId }) => objectId)] },
  );

  return c.json({ errno: 0, data: [{ [type]: updated[0]?.[type] ?? 0 }] });
});

export { article };
