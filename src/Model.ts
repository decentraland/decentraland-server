import { clients } from './db'
import { Postgres } from './db/postgres'
import { PrimaryKey, QueryPart, OnConflict } from './db/types'

/**
 * Basic Model class for accesing inner attributes easily
 */
export class Model<T> {
  public static tableName: string = null
  public static primaryKey: string = 'id'
  public static withTimestamps: boolean = true

  /**
   * DB client to use. We use Postgres by default. Can be changed via Model.useDB('db client')
   */
  public static db: Postgres = clients.postgres

  /**
   * Change the current DB client
   * @param dbClient - The name of an available db client (from /db) or an object with the same API
   */
  static setDb(clientName: keyof typeof clients = 'postgres') {
    if (typeof clientName === 'string' && !clients[clientName]) {
      throw new Error(`Undefined db client ${clients}`)
    }

    this.db = clients[clientName]
  }

  /**
   * Return the rows that match the conditions
   * @param [conditions] - It returns all rows if empty
   * @param [orderBy]    - Object describing the column ordering
   * @param [extra]      - String appended at the end of the query
   */
  static find<U extends QueryPart = any>(
    conditions?: Partial<U>,
    orderBy?: Partial<U>,
    extra?: string
  ): Promise<U[]> {
    return this.db.select(this.tableName, conditions, orderBy, extra)
  }

  /**
   * Return the row for the supplied primaryKey or condition object
   * @param primaryKeyOrCond - If the argument is an object it uses it for the conditions. Otherwise it'll use it as the searched primaryKey.
   */
  static findOne<U = any, P extends QueryPart = any>(
    primaryKey: PrimaryKey,
    orderBy?: Partial<P>
  )
  static findOne<U extends QueryPart = any, P extends QueryPart = any>(
    conditions: Partial<U>,
    orderBy?: Partial<P>
  )
  static findOne<U extends QueryPart = any, P extends QueryPart = any>(
    primaryKeyOrCond: PrimaryKey | Partial<U>,
    orderBy?: Partial<P>
  ): Promise<U> {
    const conditions =
      typeof primaryKeyOrCond === 'object'
        ? primaryKeyOrCond
        : { [this.primaryKey]: primaryKeyOrCond }

    return this.db.selectOne(this.tableName, conditions, orderBy)
  }

  /**
   * Count the rows for the table
   * @param [conditions] - It returns all rows if empty
   * @param [extra]      - String appended at the end of the query
   */
  static async count<U extends QueryPart = any>(
    conditions: Partial<U>,
    extra?: string
  ): Promise<number> {
    const result = await this.db.count(this.tableName, conditions, extra)
    return result.length ? parseInt(result[0].count, 10) : 0
  }

  /**
   * Forward queries to the db client
   * @param  queryString
   * @param  [values]
   * @return Array containing the matched rows
   */
  static async query<U = any>(queryString, values?: any[]): Promise<U[]> {
    return await this.db.query(queryString, values)
  }

  /**
   * Insert the row the Model.tableName table
   * @param  row
   * @return The row argument with the inserted primaryKey
   */
  static async create<U extends QueryPart = any>(row: U): Promise<U> {
    return this.insert(row)
  }

  /**
   * Upsert the row the Model.tableName table
   * @param row
   * @param target
   * @param changes
   * @return Row argument with the inserted primaryKey
   */
  static async upsert<U extends QueryPart = any>(
    row: U,
    onConflict: OnConflict<U> = { target: [this.primaryKey] }
  ): Promise<U> {
    return this.insert(row, onConflict)
  }

  protected static async insert<U extends QueryPart = any>(
    row: U,
    onConflict?: OnConflict
  ): Promise<U> {
    const createdAt = new Date()
    const updatedAt = new Date()

    if (onConflict) {
      onConflict.changes = onConflict.changes || row
    }

    if (this.withTimestamps) {
      row.created_at = row.created_at || createdAt
      row.updated_at = row.updated_at || updatedAt

      if (onConflict) {
        onConflict.changes.updated_at =
          onConflict.changes.updated_at || updatedAt
      }
    }

    const insertion = await this.db.insert(
      this.tableName,
      row,
      this.primaryKey,
      onConflict
    )
    const newRow = insertion.rows[0]

    if (newRow) {
      row[this.primaryKey] = newRow[this.primaryKey]
    }

    return row
  }

  /**
   * Update the row on the Model.tableName table.
   * @param changes    - An object describing the updates.
   * @param conditions - An object describing the WHERE clause.
   */
  static update<U extends QueryPart = any, P extends QueryPart = any>(
    changes: Partial<U>,
    conditions: Partial<P>
  ) {
    if (this.withTimestamps) {
      changes.updated_at = changes.updated_at || new Date()
    }
    return this.db.update(this.tableName, changes, conditions)
  }

  /**
   * Delete the row on the Model.tableName table.
   * @param conditions - An object describing the WHERE clause.
   */
  static delete<U extends QueryPart = any>(conditions: Partial<U>) {
    return this.db.delete(this.tableName, conditions)
  }

  /**
   * Checks to see if all column names exist on the attributes object.
   * If you need a more complex approach (skipping NULLABLE columns for example) you can override it.
   * @param  attributes - Model attributes to check
   * @return True if at least one of the properties don't exist on the object
   */
  public attributes: T
  public tableName: string
  public primaryKey: keyof T

  /**
   * Creates a new instance storing the attributes for later use
   * @param attributes
   */
  constructor(attributes?: T) {
    const Constructor = this.getConstructor()

    this.tableName = Constructor.tableName
    this.attributes = attributes
    this.primaryKey = Constructor.primaryKey as keyof T
  }

  getConstructor() {
    return <typeof Model>this.constructor
  }

  /**
   * Return a query by id
   */
  getDefaultQuery(): Partial<T> {
    const query: Partial<T> = {}
    query[this.primaryKey] = this.get(this.primaryKey)
    return query
  }

  /**
   * Return the row for the this.attributes primaryKey property or the supplied conditions, forwards to Model.findOne
   * @param  conditions - An object describing the WHERE clause.
   */
  async retreive(conditions?: Partial<T>): Promise<T> {
    const Constructor = this.getConstructor()
    const query = conditions ? conditions : this.getDefaultQuery()

    this.attributes = await Constructor.findOne<T>(query)

    return this.attributes
  }

  /**
   * Forwards to Model.insert using this.attributes
   */
  async create() {
    const row = await this.getConstructor().create<T>(this.attributes)
    this.set(this.primaryKey, row[this.primaryKey])
    return row
  }

  /**
   * Forwards to Model.insert using this.attributes and the supplied columns or the primaryKey as ON CONFLICT targets
   */
  async upsert<K extends keyof T>(onConflict?: OnConflict<T>) {
    const row = await this.getConstructor().upsert<T>(
      this.attributes,
      onConflict
    )
    this.set(this.primaryKey, row[this.primaryKey])
    return row
  }

  /**
   * Forwards to Mode.update using this.attributes. If no conditions are supplied, it uses this.attributes[primaryKey]
   * @params [conditions={ primaryKey: this.attributes[primaryKey] }]
   */
  update(conditions?: Partial<T>) {
    const query = conditions ? conditions : this.getDefaultQuery()
    return this.getConstructor().update(this.attributes, query)
  }

  /**
   * Forwards to Mode.delete using this.attributes. If no conditions are supplied, it uses this.attributes[primaryKey]
   * @params [conditions={ primaryKey: this.attributes[primaryKey] }]
   */
  delete(conditions?: Partial<T>) {
    const query = conditions ? conditions : this.getDefaultQuery()
    return this.getConstructor().delete(query)
  }

  /**
   * Returns true if the `attributes` property evaluates to false
   * Or it's an empty object
   */
  isEmpty(): boolean {
    return !this.attributes || Object.keys(this.attributes).length === 0
  }

  /**
   * Get a value for a given property name
   * @param  [key] - Key on the attributes object. If falsy, it'll return the full attributes object
   * @return Value found, if any
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.attributes[key]
  }

  /**
   * Gets all model attributes
   */
  getAll(): T {
    return this.attributes
  }

  /**
   * Get a nested attribute for an object. Inspired on [immutable js getIn]{@link https://facebook.github.io/immutable-js/docs/#/Map/getIn}
   * @param  keyPath - Path of keys to follow
   * @return The value of the searched key or null if any key is missing along the way
   */
  getIn(keyPath: string[]) {
    if (keyPath.length === 0) return null

    let value = this.attributes

    for (let prop of keyPath) {
      if (!value) return null
      value = value[prop]
    }

    return value
  }

  /**
   * Set a top level key with a value
   * @param key
   * @param value
   * @return The instance of the model (chainable)
   */
  set<K extends keyof T>(key: K, value: T[K]): Model<T> {
    this.attributes[key] = value
    return this
  }

  /**
   * Set a nested attribute for an object.
   * It shortcircuits if any key is missing. Inspired on [immutable js setIn]{@link https://facebook.github.io/immutable-js/docs/#/Map/setIn}
   * @param  keyPath - Path of keys
   * @param  value  - Value to set
   * @return The instance of the model (chainable)
   */
  setIn(keyPath: string[], value) {
    let keyAmount = keyPath.length
    let nested = this.attributes

    for (let i = 0; i < keyAmount; i++) {
      if (!nested) return null

      let key = keyPath[i]

      if (i + 1 === keyAmount) {
        nested[key] = value
      } else {
        nested = nested[key]
      }
    }

    return this
  }

  /**
   * Assign object properties to the stored attributes
   * @param template
   * @return The instance of the model (chainable)
   */
  assign(template: Partial<T>): Model<T> {
    this.attributes = Object.assign({}, this.attributes, template)
    return this
  }
}
