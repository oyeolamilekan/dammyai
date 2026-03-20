import { v } from 'convex/values'

/**
 * Convex arg validators for standard pagination inputs.
 * Use as spread in function arg definitions: args: { ...pageArgs, ... }
 */
export const pageArgs = {
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
}

/** Clamps page number to a minimum of 1. */
export const normalizePage = (page?: number) => Math.max(1, page ?? 1)

/** Clamps limit to the range [1, 50], defaulting to 20. */
export const normalizeLimit = (limit?: number) =>
  Math.min(50, Math.max(1, limit ?? 20))

/**
 * Slices an array into a single page and returns pagination metadata.
 * @param items - Full result set
 * @param page - 1-based page number
 * @param limit - Items per page
 */
export const paginate = <T>(items: Array<T>, page: number, limit: number) => {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
  }
}
