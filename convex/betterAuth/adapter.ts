import { createApi } from '@convex-dev/better-auth'
import { createAuthOptions } from './auth'
import schema from './schema'

/**
 * Purpose: Exposes the Better Auth Convex adapter CRUD helpers that power auth persistence for users, sessions, accounts, and related records.
 * Value type: destructured API object
 */
export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, createAuthOptions)
