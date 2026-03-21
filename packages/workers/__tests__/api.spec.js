import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createD1Mock } from './helpers/d1.js';
import { hashPassword, createToken } from '../src/auth.js';

let db;
let app;
const JWT_KEY = 'test-secret-key';

beforeEach(() => {
  db = createD1Mock();
  app = createApp({ DB: db, JWT_TOKEN: JWT_KEY });
});

// Helper: make a request to the app
async function req(method, path, { body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }

  return app.request(`http://localhost${path}`, init);
}

async function createUser({ email = 'admin@example.com', password = 'password123', display_name = 'Admin', type = 'administrator' } = {}) {
  const { D1Storage } = await import('../src/storage/d1.js');
  const userStorage = new D1Storage('Users', db);
  const hashed = await hashPassword(password);
  const user = await userStorage.add({
    email,
    password: hashed,
    display_name,
    type,
    url: '',
  });
  return user;
}

async function getAuthHeader(user, password = 'password123') {
  const res = await req('POST', '/api/token', { body: { email: user.email, password } });
  const data = await res.json();
  return { Authorization: `Bearer ${data.data.token}` };
}

describe('Health check', () => {
  it('GET / returns running message', async () => {
    const res = await req('GET', '/');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Waline');
  });
});

describe('POST /api/token (login)', () => {
  it('should return 401 for unknown user', async () => {
    const res = await req('POST', '/api/token', {
      body: { email: 'nobody@example.com', password: 'wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('should login successfully with correct credentials', async () => {
    const user = await createUser();
    const res = await req('POST', '/api/token', {
      body: { email: user.email, password: 'password123' },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data.token).toBeTruthy();
    expect(data.data.email).toBe(user.email);
  });

  it('should return 401 for wrong password', async () => {
    const user = await createUser();
    const res = await req('POST', '/api/token', {
      body: { email: user.email, password: 'wrongpassword' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/token', () => {
  it('should return null user when not authenticated', async () => {
    const res = await req('GET', '/api/token');
    const data = await res.json();
    expect(data.data).toBeNull();
  });

  it('should return user info when authenticated', async () => {
    const user = await createUser();
    const authHeader = await getAuthHeader(user);
    const res = await req('GET', '/api/token', { headers: authHeader });
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data.email).toBe(user.email);
  });
});

describe('POST /api/user (register)', () => {
  it('should register the first user as administrator', async () => {
    const res = await req('POST', '/api/user', {
      body: { display_name: 'Admin', email: 'admin@example.com', password: 'password123' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errno).toBe(0);

    // Verify user type
    const { D1Storage } = await import('../src/storage/d1.js');
    const userStorage = new D1Storage('Users', db);
    const users = await userStorage.select({ email: 'admin@example.com' });
    expect(users[0].type).toBe('administrator');
  });

  it('should register subsequent users as guest', async () => {
    await createUser({ email: 'admin@example.com', type: 'administrator' });

    const res = await req('POST', '/api/user', {
      body: { display_name: 'Guest', email: 'guest@example.com', password: 'password123' },
    });
    expect(res.status).toBe(200);

    const { D1Storage } = await import('../src/storage/d1.js');
    const userStorage = new D1Storage('Users', db);
    const users = await userStorage.select({ email: 'guest@example.com' });
    expect(users[0].type).toBe('guest');
  });

  it('should return 400 for missing fields', async () => {
    const res = await req('POST', '/api/user', {
      body: { display_name: 'Test' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/comment', () => {
  it('should return empty comment list for unknown URL', async () => {
    const res = await req('GET', '/api/comment?url=/unknown');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data.count).toBe(0);
    expect(data.data.data).toEqual([]);
  });

  it('should return count=0 when no comments', async () => {
    const res = await req('GET', '/api/comment?type=count&url=/post/1');
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data).toBe(0);
  });
});

describe('POST /api/comment', () => {
  it('should create a comment successfully', async () => {
    const res = await req('POST', '/api/comment', {
      body: {
        url: '/post/1',
        comment: 'Hello world!',
        nick: 'Tester',
        mail: 'test@example.com',
        ua: 'Mozilla/5.0',
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data.objectId).toBeTruthy();
    expect(data.data.comment).toBeTruthy(); // rendered markdown
  });

  it('should return 400 for missing required fields', async () => {
    const res = await req('POST', '/api/comment', {
      body: { comment: 'No URL provided' },
    });
    expect(res.status).toBe(400);
  });

  it('should detect duplicate comments', async () => {
    const payload = {
      url: '/post/1',
      comment: 'Duplicate comment',
      nick: 'Tester',
      mail: 'test@example.com',
      ua: 'Mozilla/5.0',
    };

    await req('POST', '/api/comment', { body: payload });
    const res = await req('POST', '/api/comment', { body: payload });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errmsg).toContain('Duplicate');
  });

  it('should return comment count after posting', async () => {
    await req('POST', '/api/comment', {
      body: { url: '/post/2', comment: 'A comment', nick: 'User1', mail: 'u1@test.com', ua: '' },
    });
    await req('POST', '/api/comment', {
      body: { url: '/post/2', comment: 'Another comment', nick: 'User2', mail: 'u2@test.com', ua: '' },
    });

    const res = await req('GET', '/api/comment?type=count&url=/post/2');
    const data = await res.json();
    expect(data.data).toBe(2);
  });
});

describe('GET /api/comment - list', () => {
  it('should return comments with pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      await req('POST', '/api/comment', {
        body: { url: '/post/paged', comment: `Comment ${i}`, nick: `User${i}`, mail: `u${i}@test.com`, ua: '' },
      });
    }

    const res = await req('GET', '/api/comment?url=/post/paged&page=1&pageSize=3');
    const data = await res.json();

    expect(data.errno).toBe(0);
    expect(data.data.count).toBe(5);
    expect(data.data.data).toHaveLength(3);
    expect(data.data.totalPages).toBe(2);
  });
});

describe('PUT /api/comment/:id', () => {
  it('should require authentication to update', async () => {
    const { D1Storage } = await import('../src/storage/d1.js');
    const commentStorage = new D1Storage('Comment', db);
    const comment = await commentStorage.add({
      url: '/post/1', comment: 'Test', nick: 'Tester', status: 'approved', insertedAt: new Date().toISOString(),
    });

    const res = await req('PUT', `/api/comment/${comment.objectId}`, {
      body: { status: 'spam' },
    });
    expect(res.status).toBe(401);
  });

  it('should allow admin to update comment status', async () => {
    const admin = await createUser();
    const authHeader = await getAuthHeader(admin);

    const postRes = await req('POST', '/api/comment', {
      body: { url: '/post/1', comment: 'Test', nick: 'Tester', mail: 'tester@test.com', ua: '' },
    });
    const postData = await postRes.json();
    const commentId = postData.data.objectId;

    const res = await req('PUT', `/api/comment/${commentId}`, {
      headers: authHeader,
      body: { status: 'spam' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errno).toBe(0);
  });
});

describe('DELETE /api/comment/:id', () => {
  it('should require authentication to delete', async () => {
    const { D1Storage } = await import('../src/storage/d1.js');
    const commentStorage = new D1Storage('Comment', db);
    const comment = await commentStorage.add({
      url: '/post/1', comment: 'Test', nick: 'Tester', status: 'approved', insertedAt: new Date().toISOString(),
    });

    const res = await req('DELETE', `/api/comment/${comment.objectId}`);
    expect(res.status).toBe(401);
  });

  it('should allow admin to delete a comment', async () => {
    const admin = await createUser();
    const authHeader = await getAuthHeader(admin);

    const postRes = await req('POST', '/api/comment', {
      body: { url: '/post/1', comment: 'To delete', nick: 'Tester', mail: 'tester@test.com', ua: '' },
    });
    const postData = await postRes.json();
    const commentId = postData.data.objectId;

    const deleteRes = await req('DELETE', `/api/comment/${commentId}`, { headers: authHeader });
    expect(deleteRes.status).toBe(200);

    // Verify it's gone
    const countRes = await req('GET', '/api/comment?type=count&url=/post/1');
    const countData = await countRes.json();
    expect(countData.data).toBe(0);
  });
});

describe('GET /api/article', () => {
  it('should return zero count for unknown URL', async () => {
    const res = await req('GET', '/api/article?path=/unknown&type=time');
    const data = await res.json();
    expect(data.errno).toBe(0);
    expect(data.data.time).toBe(0);
  });
});

describe('POST /api/article', () => {
  it('should increment view counter', async () => {
    const res1 = await req('POST', '/api/article', {
      body: { path: '/post/view', type: 'time' },
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.data[0].time).toBe(1);

    const res2 = await req('POST', '/api/article', {
      body: { path: '/post/view', type: 'time' },
    });
    const data2 = await res2.json();
    expect(data2.data[0].time).toBe(2);
  });

  it('should handle like counter separately', async () => {
    await req('POST', '/api/article', {
      body: { path: '/post/like', type: 'time' },
    });
    const res = await req('POST', '/api/article', {
      body: { path: '/post/like', type: 'like' },
    });
    const data = await res.json();
    expect(data.data[0].like).toBe(1);

    const getRes = await req('GET', '/api/article?path=/post/like&type=time&type=like');
    const getData = await getRes.json();
    expect(getData.data.time).toBe(1);
    expect(getData.data.like).toBe(1);
  });

  it('should handle desc action (decrement)', async () => {
    await req('POST', '/api/article', {
      body: { path: '/post/desc', type: 'like' },
    });
    await req('POST', '/api/article', {
      body: { path: '/post/desc', type: 'like' },
    });

    const res = await req('POST', '/api/article', {
      body: { path: '/post/desc', type: 'like', action: 'desc' },
    });
    const data = await res.json();
    expect(data.data[0].like).toBe(1);
  });
});
