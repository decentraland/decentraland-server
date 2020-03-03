export type QueryArgument = {
  text: string
  values: any[]
}

export type QueryPart = {
  [name: string]: any
}

export type Column = {
  [columnName: string]: any
}

export type Timestamps = Partial<{
  created_at: Date
  updated_at: Date
}>

export type OrderClause = {
  [columnName: string]: string
}

export type OnConflict<U extends QueryPart = any, C = Partial<U>> = {
  target: (keyof U)[]
  changes?: C
}

export type PrimaryKey = string | number
