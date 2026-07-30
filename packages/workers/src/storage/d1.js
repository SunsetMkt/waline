/**
 * Cloudflare D1 storage adapter for Waline.
 * Implements the same interface as other Waline storage adapters (base.js pattern).
 * D1 is SQLite-compatible, so SQL queries use SQLite syntax.
 */

/**
 * Quote a column name to handle SQLite reserved keywords (e.g. "like", "key").
 */
function quoteCol(name) {
  return `"${name}"`;
}

export class D1Storage {
  constructor(tableName, db, { prefix = 'wl_' } = {}) {
    this.tableName = tableName;
    this.db = db;
    this.prefix = prefix;
  }

  get fullTableName() {
    return `${this.prefix}${this.tableName}`;
  }

  /**
   * Build a WHERE clause and parameter list from a filter object.
   * Supports the same filter format used across all Waline storage adapters:
   *   - string/number: exact match
   *   - undefined: IS NULL
   *   - ['IN', [...]] / ['NOT IN', [...]] / ['LIKE', str] / ['!=', val] / ['>', val]
   *   - _complex: OR conditions
   */
  buildWhere(filter) {
    if (!filter || Object.keys(filter).length === 0) {
      return { sql: '', params: [] };
    }

    const conditions = [];
    const params = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '_complex') continue;

      const colName = quoteCol(key === 'objectId' || key === 'objectid' ? 'id' : key);

      if (value === undefined || value === null) {
        conditions.push(`${colName} IS NULL`);
        continue;
      }

      if (Array.isArray(value)) {
        const [op, val] = value;
        const opUpper = op.toUpperCase();

        if (opUpper === 'IN') {
          if (!val || val.length === 0) continue;
          const placeholders = val.map(() => '?').join(', ');
          conditions.push(`${colName} IN (${placeholders})`);
          params.push(...val);
        } else if (opUpper === 'NOT IN') {
          if (!val || val.length === 0) continue;
          const placeholders = val.map(() => '?').join(', ');
          conditions.push(`${colName} NOT IN (${placeholders})`);
          params.push(...val);
        } else if (opUpper === 'LIKE') {
          conditions.push(`${colName} LIKE ?`);
          params.push(val);
        } else if (opUpper === '!=') {
          conditions.push(`${colName} != ?`);
          params.push(val);
        } else if (opUpper === '>') {
          conditions.push(`${colName} > ?`);
          params.push(val);
        }
        continue;
      }

      conditions.push(`${colName} = ?`);
      params.push(value);
    }

    // Handle _complex (OR/AND conditions)
    if (filter._complex) {
      const logic = (filter._complex._logic || 'or').toUpperCase();
      const complexConditions = [];
      const complexParams = [];

      for (const [key, value] of Object.entries(filter._complex)) {
        if (key === '_logic') continue;
        const colName = quoteCol(key === 'objectId' || key === 'objectid' ? 'id' : key);

        if (Array.isArray(value)) {
          const [op, val] = value;
          const opUpper = op.toUpperCase();

          if (opUpper === 'IN' && val && val.length > 0) {
            const placeholders = val.map(() => '?').join(', ');
            complexConditions.push(`${colName} IN (${placeholders})`);
            complexParams.push(...val);
          } else if (opUpper === '!=') {
            complexConditions.push(`${colName} != ?`);
            complexParams.push(val);
          } else if (opUpper === '>') {
            complexConditions.push(`${colName} > ?`);
            complexParams.push(val);
          }
        } else if (value !== undefined && value !== null) {
          complexConditions.push(`${colName} = ?`);
          complexParams.push(value);
        }
      }

      if (complexConditions.length > 0) {
        conditions.push(`(${complexConditions.join(` ${logic} `)})`);
        params.push(...complexParams);
      }
    }

    if (conditions.length === 0) {
      return { sql: '', params: [] };
    }

    return { sql: `WHERE ${conditions.join(' AND ')}`, params };
  }

  /**
   * Select records from the table.
   * @param {Object} filter - Filter conditions
   * @param {Object} options - Query options (desc, limit, offset, field)
   * @returns {Promise<Array>} Array of records with objectId field
   */
  async select(filter = {}, { desc, limit, offset, field } = {}) {
    const { sql: where, params } = this.buildWhere(filter);

    let cols;
    if (field) {
      // Always include id so we can map to objectId
      const fields = field.includes('id') ? field : ['id', ...field];
      cols = fields.map(quoteCol).join(', ');
    } else {
      cols = '*';
    }

    let sql = `SELECT ${cols} FROM ${this.fullTableName}`;
    if (where) sql += ` ${where}`;
    if (desc) sql += ` ORDER BY ${quoteCol(desc)} DESC`;
    if (limit !== undefined || offset !== undefined) {
      sql += ` LIMIT ${limit ?? -1} OFFSET ${offset ?? 0}`;
    }

    const { results } = await this.db.prepare(sql).bind(...params).all();

    return results.map(({ id, ...row }) => ({ ...row, objectId: String(id) }));
  }

  /**
   * Count records in the table.
   * @param {Object} filter - Filter conditions
   * @param {Object} options - Options (group: array of columns to group by)
   * @returns {Promise<number|Array>} Count or grouped count array
   */
  async count(filter = {}, { group } = {}) {
    const { sql: where, params } = this.buildWhere(filter);

    if (!group) {
      const sql = `SELECT COUNT(*) as count FROM ${this.fullTableName}${where ? ` ${where}` : ''}`;
      const result = await this.db.prepare(sql).bind(...params).first();

      return result?.count ?? 0;
    }

    const groupCols = group.map(quoteCol).join(', ');
    const sql = `SELECT ${groupCols}, COUNT(*) as count FROM ${this.fullTableName}${where ? ` ${where}` : ''} GROUP BY ${groupCols}`;
    const { results } = await this.db.prepare(sql).bind(...params).all();

    return results;
  }

  /**
   * Add a new record to the table.
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Created record with objectId
   */
  async add(data) {
    const record = { ...data };
    const date = new Date().toISOString();

    if (record.objectId) {
      record.id = record.objectId;
      delete record.objectId;
    }

    record.createdAt ??= date;
    record.updatedAt ??= date;

    // Convert Date objects to ISO strings and booleans to integers for SQLite/D1
    for (const [key, val] of Object.entries(record)) {
      if (val instanceof Date) {
        record[key] = val.toISOString();
      } else if (typeof val === 'boolean') {
        record[key] = val ? 1 : 0;
      }
    }

    const cols = Object.keys(record).map(quoteCol).join(', ');
    const placeholders = Object.keys(record)
      .map(() => '?')
      .join(', ');
    const values = Object.values(record);

    const sql = `INSERT INTO ${this.fullTableName} (${cols}) VALUES (${placeholders})`;
    const result = await this.db.prepare(sql).bind(...values).run();

    return { ...record, objectId: String(result.meta.last_row_id) };
  }

  /**
   * Update records matching the filter.
   * @param {Object|Function} data - Update data or function that receives current row and returns update
   * @param {Object} filter - Filter to select records to update
   * @returns {Promise<Array>} Updated records
   */
  async update(data, filter) {
    const rows = await this.select(filter);
    const results = [];

    for (const row of rows) {
      const updateData = typeof data === 'function' ? data(row) : { ...data };

      // Convert Date objects to ISO strings and booleans to integers
      for (const [key, val] of Object.entries(updateData)) {
        if (val instanceof Date) {
          updateData[key] = val.toISOString();
        } else if (typeof val === 'boolean') {
          updateData[key] = val ? 1 : 0;
        }
      }

      updateData.updatedAt = new Date().toISOString();

      const setClauses = Object.keys(updateData)
        .map((k) => `${quoteCol(k)} = ?`)
        .join(', ');
      const setValues = Object.values(updateData);

      const sql = `UPDATE ${this.fullTableName} SET ${setClauses} WHERE id = ?`;

      await this.db
        .prepare(sql)
        .bind(...setValues, row.objectId)
        .run();

      results.push({ ...row, ...updateData });
    }

    return results;
  }

  /**
   * Delete records matching the filter.
   * @param {Object} filter - Filter conditions
   * @returns {Promise<void>}
   */
  async delete(filter) {
    const { sql: where, params } = this.buildWhere(filter);
    const sql = `DELETE FROM ${this.fullTableName}${where ? ` ${where}` : ''}`;

    await this.db.prepare(sql).bind(...params).run();
  }
}
