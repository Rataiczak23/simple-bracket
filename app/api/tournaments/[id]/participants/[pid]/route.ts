import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// DELETE /api/tournaments/[id]/participants/[pid] -> admin removes an entrant (setup only).
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; pid: string } }
) {
  try {
    const supabase = createServiceClient();
    const adminToken = tokenFromRequest(req);
    const limited = await enforceRateLimits(req, [
      {
        name: "participants-remove-ip",
        key: clientIpKey(req),
        limit: 30,
        windowSec: 300,
        message: "Too many player removal attempts. Slow down and try again.",
      },
      {
        name: "participants-remove-admin",
        key: adminToken ? rateLimitKey("admin", adminToken) : null,
        limit: 30,
        windowSec: 300,
        message: "Too many player removal attempts. Slow down and try again.",
      },
    ]);
    if (limited) return limited;

    await assertAdmin(supabase, params.id, adminToken);

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", params.id)
      .single();
    if (tournament?.status !== "setup") {
      throw new HttpError(409, "Can't remove players after the tournament has started.");
    }

    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("id", params.pid)
      .eq("tournament_id", params.id);
    if (error) throw new HttpError(500, "Could not remove participant.");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
