export interface QueryArgument {
  text: string
  values: any[]
}
export interface QueryPart {
  [name: string]: any
}
export interface Column {
  [columnName: string]: any
}
export interface OrderClause {
  [columnName: string]: string
}
export interface OnConflict<U extends QueryPart = any, C = Partial<U>> {
  target: (keyof U)[]
  changes?: C
}
export type PrimaryKey = string | number
