import { describe, it, expect, beforeEach } from 'vitest';
import { D1Storage } from '../src/storage/d1.js';
import { createD1Mock } from './helpers/d1.js';

let db;
let commentStorage;
let userStorage;
let counterStorage;

beforeEach(() => {
  db = createD1Mock();
  commentStorage = new D1Storage('Comment', db);
  userStorage = new D1Storage('Users', db);
  counterStorage = new D1Storage('Counter', db);
});

describe('D1Storage - select', () => {
  it('should return empty array when no data', async () => {
    const result = await commentStorage.select({});
    expect(result).toEqual([]);
  });

  it('should add and then select a record', async () => {
    const added = await commentStorage.add({
      url: '/post/1',
      comment: 'Hello world',
      nick: 'Tester',
      mail: 'test@example.com',
      status: 'approved',
      insertedAt: new Date().toISOString(),
    });

    expect(added.objectId).toBeTruthy();
    expect(added.url).toBe('/post/1');

    const selected = await commentStorage.select({ url: '/post/1' });
    expect(selected).toHaveLength(1);
    expect(selected[0].comment).toBe('Hello world');
    expect(selected[0].objectId).toBe(added.objectId);
  });

  it('should filter by exact match', async () => {
    await commentStorage.add({ url: '/a', comment: 'Comment A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'Comment B', nick: 'B', status: 'approved', insertedAt: new Date().toISOString() });

    const result = await commentStorage.select({ url: '/a' });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('/a');
  });

  it('should filter by IN operator', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/c', comment: 'C', nick: 'C', status: 'approved', insertedAt: new Date().toISOString() });

    const result = await commentStorage.select({ url: ['IN', ['/a', '/b']] });
    expect(result).toHaveLength(2);
    const urls = result.map((r) => r.url).sort();
    expect(urls).toEqual(['/a', '/b']);
  });

  it('should filter by != operator', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', status: 'spam', insertedAt: new Date().toISOString() });

    const result = await commentStorage.select({ status: ['!=', 'spam'] });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('/a');
  });

  it('should filter by NULL (undefined value)', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', pid: null, status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', pid: 1, status: 'approved', insertedAt: new Date().toISOString() });

    const result = await commentStorage.select({ rid: undefined });
    expect(result).toHaveLength(2);
  });

  it('should respect limit and offset', async () => {
    for (let i = 1; i <= 5; i++) {
      await commentStorage.add({ url: '/post', comment: `Comment ${i}`, nick: `User${i}`, status: 'approved', insertedAt: new Date().toISOString() });
    }

    const page1 = await commentStorage.select({}, { limit: 2, offset: 0 });
    const page2 = await commentStorage.select({}, { limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    // Pages should be different
    expect(page1[0].objectId).not.toBe(page2[0].objectId);
  });

  it('should order by desc field', async () => {
    const now = Date.now();
    await commentStorage.add({ url: '/post', comment: 'First', nick: 'A', status: 'approved', insertedAt: new Date(now).toISOString() });
    await commentStorage.add({ url: '/post', comment: 'Second', nick: 'B', status: 'approved', insertedAt: new Date(now + 1000).toISOString() });

    const result = await commentStorage.select({}, { desc: 'insertedAt' });
    expect(result[0].comment).toBe('Second');
    expect(result[1].comment).toBe('First');
  });
});

describe('D1Storage - count', () => {
  it('should count all records', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', status: 'approved', insertedAt: new Date().toISOString() });

    const count = await commentStorage.count({});
    expect(count).toBe(2);
  });

  it('should count with filter', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', status: 'spam', insertedAt: new Date().toISOString() });

    const approvedCount = await commentStorage.count({ status: 'approved' });
    expect(approvedCount).toBe(1);
  });

  it('should count with group by', async () => {
    await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/a', comment: 'B', nick: 'B', status: 'spam', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'C', nick: 'C', status: 'approved', insertedAt: new Date().toISOString() });

    const result = await commentStorage.count({}, { group: ['url'] });
    expect(result).toHaveLength(2);
    const urlA = result.find((r) => r.url === '/a');
    expect(urlA?.count).toBe(2);
  });
});

describe('D1Storage - add', () => {
  it('should add a record and return with objectId', async () => {
    const data = {
      url: '/post/1',
      comment: 'Test comment',
      nick: 'Tester',
      mail: 'test@example.com',
      status: 'approved',
      insertedAt: new Date().toISOString(),
    };

    const result = await commentStorage.add(data);
    expect(result.objectId).toBeTruthy();
    expect(result.url).toBe('/post/1');
    expect(result.comment).toBe('Test comment');
  });

  it('should set createdAt and updatedAt automatically', async () => {
    const result = await commentStorage.add({
      url: '/post/1',
      comment: 'Test',
      nick: 'Tester',
      status: 'approved',
      insertedAt: new Date().toISOString(),
    });

    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });

  it('should increment IDs across multiple adds', async () => {
    const first = await commentStorage.add({ url: '/a', comment: 'A', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    const second = await commentStorage.add({ url: '/b', comment: 'B', nick: 'B', status: 'approved', insertedAt: new Date().toISOString() });

    expect(Number(first.objectId)).toBeLessThan(Number(second.objectId));
  });
});

describe('D1Storage - update', () => {
  it('should update matching records', async () => {
    const added = await commentStorage.add({
      url: '/post/1',
      comment: 'Original',
      nick: 'Tester',
      status: 'approved',
      insertedAt: new Date().toISOString(),
    });

    const updated = await commentStorage.update({ status: 'spam' }, { objectId: added.objectId });
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('spam');

    // Verify persistence
    const fetched = await commentStorage.select({ objectId: added.objectId });
    expect(fetched[0].status).toBe('spam');
  });

  it('should support function-based update', async () => {
    const added = await commentStorage.add({
      url: '/post/1',
      comment: 'Test',
      nick: 'Tester',
      status: 'approved',
      like: 0,
      insertedAt: new Date().toISOString(),
    });

    await commentStorage.update(
      (row) => ({ like: (row.like || 0) + 1 }),
      { objectId: added.objectId },
    );

    const fetched = await commentStorage.select({ objectId: added.objectId });
    expect(Number(fetched[0].like)).toBe(1);
  });
});

describe('D1Storage - delete', () => {
  it('should delete matching records', async () => {
    const added = await commentStorage.add({
      url: '/post/1',
      comment: 'To delete',
      nick: 'Tester',
      status: 'approved',
      insertedAt: new Date().toISOString(),
    });

    await commentStorage.delete({ objectId: added.objectId });

    const remaining = await commentStorage.select({ objectId: added.objectId });
    expect(remaining).toHaveLength(0);
  });

  it('should not delete non-matching records', async () => {
    await commentStorage.add({ url: '/a', comment: 'Keep', nick: 'A', status: 'approved', insertedAt: new Date().toISOString() });
    await commentStorage.add({ url: '/b', comment: 'Delete', nick: 'B', status: 'spam', insertedAt: new Date().toISOString() });

    await commentStorage.delete({ status: 'spam' });

    const remaining = await commentStorage.select({});
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe('/a');
  });
});

describe('D1Storage - Users table', () => {
  it('should store and retrieve users', async () => {
    const added = await userStorage.add({
      display_name: 'Test User',
      email: 'user@example.com',
      password: 'hashed_password',
      type: 'guest',
    });

    expect(added.objectId).toBeTruthy();
    expect(added.email).toBe('user@example.com');

    const users = await userStorage.select({ email: 'user@example.com' });
    expect(users).toHaveLength(1);
    expect(users[0].display_name).toBe('Test User');
  });
});

describe('D1Storage - Counter table', () => {
  it('should track page counters', async () => {
    await counterStorage.add({ url: '/post/1', time: 5, like: 2 });

    const counters = await counterStorage.select({ url: '/post/1' });
    expect(counters).toHaveLength(1);
    expect(Number(counters[0].time)).toBe(5);
    expect(Number(counters[0].like)).toBe(2);
  });
});
