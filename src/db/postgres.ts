import * as pg from 'pg'
import {
  Column,
  OrderClause,
  QueryArgument,
  QueryPart,
  OnConflict
} from './types'

export class Postgres {
  client: pg.Client

  /**
   * Connect to the Postgres database
   * @param connectionString
   */
  connect(connectionString?: string) {
    this.client = new pg.Client(connectionString)
    return this.client.connect()
  }

  /**
   * Forward queries to the pg client. Check {@link https://node-postgres.com/} for more info.
   * @param  queryString
   * @param  [values]    - Values to replace in the placeholders, if any
   * @return Array containing the matched rows
   */
  async query(queryString: string | QueryArgument, values?: any[]) {
    const result = await this.client.query(queryString, values)
    return result.rows
  }

  /**
   * Counts rows from a query result
   * @param  tableName
   * @param  [conditions] - An object describing the WHERE clause. The properties should be the column names and it's values the condition value.
   * @param  [extra]      - String appended at the end of the query
   * @return Rows
   */
  count(
    tableName: string,
    conditions: QueryPart,
    extra: string = ''
  ): Promise<{ count: string }[]> {
    return this._query(
      'SELECT COUNT(*) as count',
      tableName,
      conditions,
      undefined,
      extra
    )
  }

  /**
   * Select rows from a table
   * @param  tableName
   * @param  [conditions] - An object describing the WHERE clause. The properties should be the column names and it's values the condition value.
   * @param  [orderBy]    - An object describing the ORDER BY clause. The properties should be the column names and it's values the order value. See {@link postgres#getOrderValues}
   * @param  [extra]      - String appended at the end of the query
   * @return Rows
   */
  select(
    tableName: string,
    conditions?: QueryPart,
    orderBy?: QueryPart,
    extra?: string
  ): Promise<any> {
    return this._query('SELECT *', tableName, conditions, orderBy, extra)
  }

  /**
   * Select the first row that matches
   * @param  tableName
   * @param  [conditions] - An object describing the WHERE clause. The properties should be the column names and it's values the condition value.
   * @param  [orderBy]    - An object describing the ORDER BY clause. The properties should be the column names and it's values the order value. See {@link postgres#getOrderValues}
   * @return Row
   */
  async selectOne(
    tableName: string,
    conditions?: QueryPart,
    orderBy?: QueryPart
  ): Promise<any> {
    const rows = await this._query(
      'SELECT *',
      tableName,
      conditions,
      orderBy,
      'LIMIT 1'
    )

    return rows[0]
  }

  /**
   * Insert an object on the database.
   * @example
   * insert('users', { name: 'Name', avatar: 'image.png' }) => INSERT INTO users ("name", "avatar") VALUES ('Name', 'image.png')
   * @param tableName
   * @param changes           - An object describing the insertion. The properties should be the column names and it's values the value to insert
   * @param [primaryKey='id'] - Which primary key return upon insertion
   * @param [onConflict]      - Targets for the ON CONFLICT clause and subsequent changes
   */
  async insert(
    tableName: string,
    changes: QueryPart,
    primaryKey: string = 'id',
    onConflict: OnConflict = { target: [], changes: {} }
  ): Promise<any> {
    if (!changes) {
      throw new Error(
        `Tried to perform an insert on ${tableName} without any values. Supply a changes object`
      )
    }

    const values = Object.values(changes)
    const conflictValues = Object.values(onConflict.changes || {})

    return this.client.query(
      `INSERT INTO ${tableName}(
        ${this.toColumnFields(changes)}
      ) VALUES(
        ${this.toValuePlaceholders(changes)}
      )
        ${this.toOnConflictUpsert(onConflict, values.length)}
        RETURNING ${primaryKey}`,
      values.concat(conflictValues)
    )
  }

  /**
   * Update an object on the database.
   * @example
   * update('users', { name: 'New Name' } { id: 22 }) => UPDATE users SET "name"='New Name' WHERE "id"=22
   * @param tableName
   * @param changes    - An object describing the changes. The properties should be the column names and it's values the value to update.
   * @param conditions - An object describing the WHERE clause. The properties should be the column names and it's values the condition value.
   */
  async update(
    tableName: string,
    changes: QueryPart,
    conditions: QueryPart
  ): Promise<any> {
    if (!changes) {
      throw new Error(
        `Tried to update ${tableName} without any values. Supply a changes object`
      )
    }
    if (!conditions) {
      throw new Error(
        `Tried to update ${tableName} without a WHERE clause. Supply a conditions object`
      )
    }

    const changeValues = Object.values(changes)
    const conditionValues = Object.values(conditions)

    const whereClauses = this.toAssignmentFields(
      conditions,
      changeValues.length
    )

    const values = changeValues.concat(conditionValues)

    return this.client.query(
      `UPDATE ${tableName}
      SET   ${this.toAssignmentFields(changes)}
      WHERE ${whereClauses.join(' AND ')}`,
      values
    )
  }

  /**
   * Delete rows from the database
   * @param tableName
   * @param conditions - An object describing the WHERE clause.
   */
  delete(tableName: string, conditions: QueryPart): Promise<any> {
    if (!conditions) {
      throw new Error(
        `Tried to update ${tableName} without a WHERE clause. Supply a conditions object`
      )
    }

    const values = Object.values(conditions)

    return this.client.query(
      `DELETE FROM ${tableName}
      WHERE ${this.toAssignmentFields(conditions).join(' AND ')}`,
      values
    )
  }

  /**
   * Creates a table with the desired rows if it doesn't exist.
   * Adds a secuence with the table name to use as autoincrement id
   * @example
   * this.createTable('users', `
   *   "id" int NOT NULL DEFAULT nextval('users_id_seq'),
   *   "name" varchar(42) NOT NULL
   * `)
   * @param tableName
   * @param rows    - Each desired row to create
   * @param options - Options controling the behaviour of createTable
   * @param [options.sequenceName=`${tableName}_id_seq`] - Override the default sequence name. The sequenceName is a falsy value, the sequence will be skipped
   * @param [options.primaryKey="id"]                    - Override the default primary key.
   */
  async createTable(
    tableName: string,
    rows: string[],
    options: { sequenceName?: string; primaryKey?: string } = {}
  ): Promise<void> {
    const { sequenceName = `${tableName}_id_seq`, primaryKey = 'id' } = options

    if (sequenceName) await this.createSequence(sequenceName)

    await this.client.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (
      ${rows}
      PRIMARY KEY ("${primaryKey}")
    );`)

    if (sequenceName) await this.alterSequenceOwnership(sequenceName, tableName)
  }

  /**
   * Creates an index if it doesn't exist
   * @param tableName
   * @param name of the index
   * @param field
   * @param extra conditions for the index
   */
  createIndex(
    tableName: string,
    name: string,
    fields: string[],
    conditions: { unique?: boolean } = {}
  ) {
    const unique = conditions.unique === true ? 'UNIQUE' : ''

    return this.client.query(
      `CREATE ${unique} INDEX IF NOT EXISTS ${name} ON ${tableName} (${fields.join(
        ','
      )})`
    )
  }

  /**
   * Creates a sequence if it doesn't exist
   * @param name
   */
  createSequence(name: string) {
    try {
      return this.client.query(`CREATE SEQUENCE ${name};`)
    } catch (e) {
      // CREATE SEQUENCE IF NOT EXISTS is on PG9.5
      // If this fails it means that the sequence exists
    }
  }

  alterSequenceOwnership(
    name: string,
    owner: string,
    columnName: string = 'id'
  ) {
    return this.client.query(
      `ALTER SEQUENCE ${name} OWNED BY ${owner}.${columnName};`
    )
  }

  /**
   * Truncates the table provided
   * @param  tableName
   * @return Query result
   */
  truncate(tableName: string) {
    return this.client.query(`TRUNCATE ${tableName} RESTART IDENTITY;`)
  }

  /**
   *
   * @param onConflict - Targets for the ON CONFLICT clause and subsequent changes
   * @param indexStart - Where to start the placeholder index for update values
   */
  toOnConflictUpsert({ target, changes }: OnConflict, indexStart = 0) {
    return target.length > 0 && changes
      ? `ON CONFLICT (${target}) DO
        UPDATE SET ${this.toAssignmentFields(changes, indexStart)}`
      : 'ON CONFLICT DO NOTHING'
  }

  /**
   * From an map of { column1 => int, column2 => string } to an array containing
   *   ['"column1"', '"column2"', (...)]
   * @param columns - Each column as a property of the object
   */
  toColumnFields(columns: Column): string[] {
    const columnNames = Object.keys(columns)
    return columnNames.map(name => `"${name}"`)
  }

  /**
   * From an map of { column1 => int, column2 => string } to an array containing
   *   ['"column1" = $1', '"column2" = $2', (...)]
   * The index from which to start the placeholders is configurable
   * @param columns   - Each column as a property of the object
   * @param [start=0] - Start index for each placeholder
   */
  toAssignmentFields(columns: Column, start: number = 0): string[] {
    const columnNames = Object.keys(columns)
    return columnNames.map(
      (column, index) => `"${column}" = $${index + start + 1}`
    )
  }

  /**
   * From an map of { column1 => int, column2 => string } to an array containing
   *  ['$1', '$2', (...)]
   * The index from which to start the placeholders is configurable
   * @param columns   - Each column as a property of the object
   * @param [start=0] - Start index for each placeholder
   */
  toValuePlaceholders(columns: Column, start: number = 0): string[] {
    const columnNames = Object.keys(columns)
    return columnNames.map((_, index) => `$${index + start + 1}`)
  }

  /**
   * From an map of { column1 => DESC/ASC, column2 => DESC/ASC } to an array containing
   *  ['column1 DESC/ASC, 'column2 DESC/ASC', (...)]
   * @param columns - Each column as a property of the object, the values represent the desired order
   */
  getOrderValues(order: OrderClause): string[] {
    return Object.keys(order).map(column => `"${column}" ${order[column]}`)
  }

  /**
   * Close db connection
   */
  async close() {
    return this.client.end()
  }

  private async _query(
    method: string,
    tableName: string,
    conditions?: QueryPart,
    orderBy?: QueryPart,
    extra: string = ''
  ): Promise<any[]> {
    let values: any[] = []
    let where = ''
    let order = ''

    if (conditions) {
      values = Object.values(conditions)
      where = `WHERE ${this.toAssignmentFields(conditions).join(' AND ')}`
    }

    if (orderBy) {
      order = `ORDER BY ${this.getOrderValues(orderBy)}`
    }

    const result = await this.client.query(
      `${method} FROM ${tableName} ${where} ${order} ${extra}`,
      values
    )

    return result.rows
  }
}

/**
 * Client to query Postgres. Uses `pg` behind the scenes. Check {@link https://node-postgres.com/} for more info.
 */
export const postgres = new Postgres()
