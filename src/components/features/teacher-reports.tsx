// Removed: this was an export-only card with no stat cards/drill-down. The
// group detail page's own "Hisobot" tab (src/app/dashboard/groups/[groupId]/page.tsx)
// now renders the full ReportDashboard (src/components/features/report-dashboard.tsx)
// locked to that one group via its `lockGroupId` prop instead — same stat
// cards, tabs, hide-prices toggle and drill-down as the main Hisobot page,
// just scoped to this group. Nothing imports from this file anymore.
// Safe to delete: `rm src/components/features/teacher-reports.tsx`.
export {};
