import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Validate an admin token against the tournament_secrets table.
 * Reads happen with the service-role client (the only thing that can see secrets).
 * Throws on mismatch/missing.
 */
export async function assertAdmin(
  supabase: SupabaseClient,
  tournamentId: string,
  token: string | null
): Promise<void> {
  if (!token) throw new HttpError(401, "Missing admin token.");
  const { data, error } = await supabase
    .from("tournament_secrets")
    .select("admin_token")
    .eq("tournament_id", tournamentId)
    .single();
  if (error || !data) throw new HttpError(404, "Tournament not found.");
  if (data.admin_token !== token) throw new HttpError(403, "Invalid admin token.");
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Read the admin token from the standard header. */
export function tokenFromRequest(req: Request): string | null {
  return req.headers.get("x-admin-token");
}

/** Map thrown errors to a JSON response with the right status code. */
export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
