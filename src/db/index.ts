import { Postgres, postgres } from './postgres'

export * from './postgres'
export const clients = { postgres: <Postgres>postgres }
