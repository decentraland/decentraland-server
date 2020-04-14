import { clients } from './db'
import { Postgres } from './db/postgres'
import { PrimaryKey, QueryPart, Timestamps, OnConflict } from './db/types'

export function Model<T>() {
  return class InnerModel {
    public static tableName: string = ''
    public static primaryKey = 'id' as keyof T
    public static withTimestamps = true

    /**
     * DB client to use. We use Postgres by default. Can be changed via Model.useDB('db client')
     */
    public static db: Postgres = clients.postgres

    public attributes: T
    public tableName: string
    public primaryKey: keyof T

    /**
     * Creates a new instance storing the attributes for later use
     * @param attributes
     */
    constructor(attributes: T) {
      const Constructor = this.getConstructor()

      this.tableName = Constructor.tableName
      this.primaryKey = Constructor.primaryKey
      this.attributes = attributes
    }

    /**
     * Change the current DB client
     * @param dbClient - The name of an available db client (from /db) or an object with the same API
     */
    static setDb(clientName: keyof typeof clients = 'postgres') {
      this.db = clients[clientName]
    }

    /**
     * Return the rows that match the conditions
     * @param [conditions] - It returns all rows if empty
     * @param [orderBy]    - Object describing the column ordering
     * @param [extra]      - String appended at the end of the query
     */
    static find(
      conditions?: QueryPart,
      orderBy?: QueryPart,
      extra?: string
    ): Promise<T[]> {
      return this.db.select(this.tableName, conditions, orderBy, extra)
    }

    /**
     * Return the row for the supplied primaryKey or condition object
     * @param primaryKeyOrCond - If the argument is an object it uses it for the conditions. Otherwise it'll use it as the searched primaryKey.
     */
    static async findOne(
      primaryKeyOrCond: PrimaryKey | Partial<T>,
      orderBy?: QueryPart
    ): Promise<T | undefined> {
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
    static async count(
      conditions: Partial<T>,
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
    static async query<K = T>(
      queryString: string,
      values?: any[]
    ): Promise<K[]> {
      return this.db.query(queryString, values)
    }

    /**
     * Upsert the row the Model.tableName table
     * @param row
     * @param target
     * @param changes
     * @return Row argument with the inserted primaryKey
     */
    static async upsert(
      row: Partial<T>,
      onConflict: OnConflict<T> = { target: [this.primaryKey] }
    ) {
      return this.insert(row, onConflict)
    }

    /**
     * Update the row on the Model.tableName table.
     * @param changes    - An object describing the updates.
     * @param conditions - An object describing the WHERE clause.
     */
    static update(changes: Partial<T> & Timestamps, conditions: Partial<T>) {
      changes = this.withTimestamps
        ? { ...changes, updated_at: changes.updated_at || new Date() }
        : changes

      return this.db.update(this.tableName, changes, conditions)
    }

    /**
     * Delete the row on the Model.tableName table.
     * @param conditions - An object describing the WHERE clause.
     */
    static delete(conditions: Partial<T>) {
      return this.db.delete(this.tableName, conditions)
    }

    /**
     * Insert the row the Model.tableName table
     * @param  row
     * @return The row argument with the inserted primaryKey
     */
    static async create<K extends Partial<T>>(row: K) {
      return this.insert(row)
    }

    static async insert(
      _row: Partial<T>,
      onConflict?: OnConflict,
      returning: keyof T | '*' = '*'
    ) {
      const row: Partial<T> & Timestamps = Object.assign({}, _row) // Shallow copy, we only modify top level props

      if (onConflict) {
        const changes = Object.assign({}, onConflict.changes) // Shallow copy, we only modify top level props
        onConflict.changes = onConflict.changes ? changes : row
      }

      if (this.withTimestamps) {
        const now = new Date()

        Object.assign(row, {
          created_at: row.created_at || now,
          updated_at: row.updated_at || now
        })

        if (onConflict) {
          const changes = onConflict.changes || {}
          changes.updated_at = changes.updated_at || now

          onConflict.changes = changes
        }
      }

      const insertion = await this.db.insert(
        this.tableName,
        row,
        returning.toString(),
        onConflict
      )
      const newRow = insertion.rows[0] as T
      return newRow
    }

    getConstructor() {
      return this.constructor as typeof InnerModel
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
     * Set the row for the this.attributes primaryKey property or the supplied conditions, forwards to Model.findOne
     */
    async retreive() {
      const Constructor = this.getConstructor()
      const query = this.getDefaultQuery()

      const attributes = await Constructor.findOne(query)
      if (attributes) {
        return new Constructor(attributes)
      }

      return this
    }

    /**
     * Forwards to Model.insert using this.attributes
     */
    async create() {
      const Constructor = this.getConstructor()
      const row = await Constructor.create(this.attributes)
      if (row[this.primaryKey]) {
        this.set(this.primaryKey, row[this.primaryKey])
      }
      return row
    }

    /**
     * Forwards to Model.insert using this.attributes and the supplied columns or the primaryKey as ON CONFLICT targets
     */
    async upsert(onConflict?: OnConflict<Partial<T>>) {
      const row = await this.getConstructor().upsert(
        this.attributes,
        onConflict
      )
      if (row[this.primaryKey]) {
        this.set(this.primaryKey, row[this.primaryKey])
      }
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
     * @param  [key] - Key on the attributes object
     * @return Value found, if any
     */
    get<K extends keyof T>(key: K): T[K] | undefined {
      return this.attributes[key]
    }

    /**
     * Gets all model attributes
     */
    getAll() {
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
    set<K extends keyof T>(key: K, value: T[K]) {
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
    assign(template: Partial<T>) {
      this.attributes = Object.assign({}, this.attributes, template)
      return this
    }
  }
}
