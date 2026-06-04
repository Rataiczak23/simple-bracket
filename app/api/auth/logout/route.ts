import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/admin";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/auth/logout -> clear the session and redirect home.
export async function POST(req: Request) {
  try {
    await destroySession();
    return NextResponse.redirect(new URL("/", req.url), { status: 303 });
  } catch (err) {
    return errorResponse(err);
  }
}
