import { NextResponse } from "next/server";

// Self-service signup is disabled. Accounts are created directly by the admin.
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
