import { Prisma } from "@prisma/client";

/**
 * Prisma `Decimal` values are class instances, not plain objects — passing
 * them straight from a Server Component / Server Action to a "use client"
 * component throws at runtime ("Only plain objects can be passed to Client
 * Components from Server Components. Decimal objects are not supported.").
 *
 * Every server action in this app eventually hands its result to a client
 * component (managers, forms, the Attendance Journal), so we run every
 * response through this before returning it — it walks the object graph
 * and converts any Decimal into a plain `number`, recursing through arrays
 * and nested objects. Dates are left untouched since Next's server action
 * serialization already supports them natively.
 */
export function serializeDecimals<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return Number(value) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDecimals(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeDecimals(val);
    }
    return out as T;
  }
  return value;
}
