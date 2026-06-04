import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/tournaments/[id]/reset -> clear all matches and return to setup.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    const adminToken = tokenFromRequest(req);
    const limited = await enforceRateLimits(req, [
      {
        name: "tournament-reset-ip",
        key: clientIpKey(req),
        limit: 8,
        windowSec: 600,
        message: "Too many reset attempts. Try again later.",
      },
      {
        name: "tournament-reset-admin",
        key: adminToken ? rateLimitKey("admin", adminToken) : null,
        limit: 8,
        windowSec: 600,
        message: "Too many reset attempts. Try again later.",
      },
    ]);
    if (limited) return limited;

    await assertAdmin(supabase, params.id, adminToken);

    const { error: dErr } = await supabase.from("matches").delete().eq("tournament_id", params.id);
    if (dErr) throw new HttpError(500, "Could not clear the bracket.");

    // Drop any saved standings — they'll be recomputed when it finishes again.
    await supabase.from("results").delete().eq("tournament_id", params.id);

    const { error: uErr } = await supabase
      .from("tournaments")
      .update({ status: "setup", winner_id: null })
      .eq("id", params.id);
    if (uErr) throw new HttpError(500, "Could not reset the tournament.");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
