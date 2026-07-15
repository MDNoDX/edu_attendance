import { NextResponse } from "next/server";

// Removed: there is no separate Admin report endpoint anymore. Every teacher
// exports their own data from /api/reports/teacher (see that route).
export async function GET() {
  return NextResponse.json({ error: "Removed. Use /api/reports/teacher instead." }, { status: 410 });
}
