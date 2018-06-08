import { Postgres, postgres } from './postgres'

export * from './postgres'
export * from './types'
export const clients = { postgres: <Postgres>postgres }
