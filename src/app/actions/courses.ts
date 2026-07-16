// Removed: the separate Course template entity was folded directly into
// Group (see prisma/schema.prisma — Group now carries its own name,
// subject, monthlyPrice, lessonsPerMonth). Nothing imports from this file.
// Safe to delete: `rm src/app/actions/courses.ts`.
export {};
