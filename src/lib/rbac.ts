// Removed: there is only one role now (Teacher, self-service), so
// role-based access control is no longer needed — every server action just
// calls requireSession() from src/lib/auth.ts and scopes queries to the
// logged-in user's own id. Safe to delete this file (`rm src/lib/rbac.ts`).
export {};
