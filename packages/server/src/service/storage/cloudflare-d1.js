const Base = require('./base.js');

const { CLOUDFLARE_D1_PREFIX } = process.env;

module.exports = class extends Base {
  get db() {
    return think.config('d1Database');
  }

  get tablePrefix() {
    return think.config('d1Prefix') || CLOUDFLARE_D1_PREFIX || 'wl_';
  }

  get fullTableName() {
    return this.tablePrefix + this.tableName;
  }

  buildCondition(key, value) {
    if (value === undefined || value === null) {
      return { sql: `\`${key}\` IS NULL`, params: [] };
    }

    if (Array.isArray(value)) {
      const [op, val] = value;
      const upperOp = op.toUpperCase();

      if (upperOp === 'IN') {
        if (!val || val.length === 0) {
          return null;
        }
        const placeholders = val.map(() => '?').join(', ');
        return { sql: `\`${key}\` IN (${placeholders})`, params: val };
      }

      if (upperOp === 'NOT IN') {
        if (!val || val.length === 0) {
          return null;
        }
        const placeholders = val.map(() => '?').join(', ');
        return { sql: `\`${key}\` NOT IN (${placeholders})`, params: val };
      }

      if (upperOp === 'LIKE') {
        return { sql: `\`${key}\` LIKE ?`, params: [val] };
      }

      if (upperOp === '!=') {
        return { sql: `\`${key}\` != ?`, params: [val] };
      }

      if (upperOp === '>') {
        return { sql: `\`${key}\` > ?`, params: [val] };
      }

      if (upperOp === '>=') {
        return { sql: `\`${key}\` >= ?`, params: [val] };
      }

      if (upperOp === '<') {
        return { sql: `\`${key}\` < ?`, params: [val] };
      }

      if (upperOp === '<=') {
        return { sql: `\`${key}\` <= ?`, params: [val] };
      }
    }

    return { sql: `\`${key}\` = ?`, params: [value] };
  }

  buildWhereClause(filter) {
    if (think.isEmpty(filter)) {
      return { sql: '', params: [] };
    }

    const conditions = [];
    const params = [];

    for (const k in filter) {
      if (k === 'objectId' || k === 'objectid') {
        conditions.push('`id` = ?');
        params.push(filter[k]);
        continue;
      }

      if (k === '_complex') {
        const logic = (filter[k]._logic || 'OR').toUpperCase();
        const subConditions = [];

        for (const subK in filter[k]) {
          if (subK === '_logic') {
            continue;
          }

          const colKey = subK === 'objectId' || subK === 'objectid' ? 'id' : subK;
          const result = this.buildCondition(colKey, filter[k][subK]);

          if (result) {
            subConditions.push(result.sql);
            params.push(...result.params);
          }
        }

        if (subConditions.length > 0) {
          conditions.push(`(${subConditions.join(` ${logic} `)})`);
        }
        continue;
      }

      if (filter[k] === undefined) {
        conditions.push(`\`${k}\` IS NULL`);
        continue;
      }

      if (Array.isArray(filter[k]) && think.isDate(filter[k][1])) {
        const [op, dateVal] = filter[k];
        const result = this.buildCondition(k, [op, dateVal.toISOString()]);

        if (result) {
          conditions.push(result.sql);
          params.push(...result.params);
        }
        continue;
      }

      const result = this.buildCondition(k, filter[k]);

      if (result) {
        conditions.push(result.sql);
        params.push(...result.params);
      }
    }

    if (conditions.length === 0) {
      return { sql: '', params: [] };
    }

    return { sql: 'WHERE ' + conditions.join(' AND '), params };
  }

  serializeValue(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  async select(where, { desc, limit, offset, field } = {}) {
    const tableName = this.fullTableName;
    const { sql: whereClause, params } = this.buildWhereClause(where);

    let fields = '*';

    if (field) {
      const cols = Array.from(new Set(['id', ...field])).map((f) => `\`${f}\``);
      fields = cols.join(', ');
    }

    let sql = `SELECT ${fields} FROM \`${tableName}\``;

    if (whereClause) {
      sql += ` ${whereClause}`;
    }
    if (desc) {
      sql += ` ORDER BY \`${desc}\` DESC`;
    }
    if (limit !== undefined || offset !== undefined) {
      sql += ` LIMIT ${limit ?? -1}`;
      if (offset) {
        sql += ` OFFSET ${offset}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return (results || []).map(({ id, ...row }) => ({ ...row, objectId: id }));
  }

  async count(where = {}, { group } = {}) {
    const tableName = this.fullTableName;
    const { sql: whereClause, params } = this.buildWhereClause(where);

    if (!group) {
      let sql = `SELECT COUNT(*) AS count FROM \`${tableName}\``;

      if (whereClause) {
        sql += ` ${whereClause}`;
      }

      const stmt = this.db.prepare(sql);
      const result =
        params.length > 0 ? await stmt.bind(...params).first() : await stmt.first();

      return result ? result.count : 0;
    }

    const groupFields = (Array.isArray(group) ? group : [group])
      .map((f) => `\`${f}\``)
      .join(', ');

    let sql = `SELECT ${groupFields}, COUNT(*) AS count FROM \`${tableName}\``;

    if (whereClause) {
      sql += ` ${whereClause}`;
    }
    sql += ` GROUP BY ${groupFields}`;

    const stmt = this.db.prepare(sql);
    const { results } =
      params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return results || [];
  }

  async add(data) {
    const record = { ...data };

    if (record.objectId) {
      record.id = record.objectId;
      delete record.objectId;
    }

    const date = new Date();

    record.createdAt ??= date;
    record.updatedAt ??= date;

    const serialized = {};

    for (const key in record) {
      serialized[key] = this.serializeValue(record[key]);
    }

    const tableName = this.fullTableName;
    const keys = Object.keys(serialized);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${tableName}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${placeholders})`;

    const result = await this.db
      .prepare(sql)
      .bind(...Object.values(serialized))
      .run();

    return { ...record, objectId: result.meta.last_row_id };
  }

  async update(data, where) {
    const records = await this.select(where);

    return Promise.all(
      records.map(async (item) => {
        const updateData = typeof data === 'function' ? data(item) : { ...data };
        const serialized = {};

        for (const key in updateData) {
          serialized[key] = this.serializeValue(updateData[key]);
        }

        const tableName = this.fullTableName;
        const setClauses = Object.keys(serialized)
          .map((k) => `\`${k}\` = ?`)
          .join(', ');
        const sql = `UPDATE \`${tableName}\` SET ${setClauses} WHERE \`id\` = ?`;

        await this.db
          .prepare(sql)
          .bind(...Object.values(serialized), item.objectId)
          .run();

        return { ...item, ...updateData };
      }),
    );
  }

  async delete(where) {
    const tableName = this.fullTableName;
    const { sql: whereClause, params } = this.buildWhereClause(where);

    let sql = `DELETE FROM \`${tableName}\``;

    if (whereClause) {
      sql += ` ${whereClause}`;
    }

    const stmt = this.db.prepare(sql);

    return params.length > 0 ? stmt.bind(...params).run() : stmt.run();
  }

  async setSeqId(id) {
    return this.db
      .prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`)
      .bind(id, this.fullTableName)
      .run();
  }
};
