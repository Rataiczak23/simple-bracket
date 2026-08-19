import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { errorResponse, HttpError } from "@/lib/admin";
import { requireOwner } from "@/lib/auth";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";
import type { Tournament } from "@/lib/types";

export const runtime = "nodejs";

// DELETE /api/tournaments/[id] -> owner-only hard delete of an unfinished
// tournament and everything hanging off it.
//
// Two guards, both server-side:
//   * requireOwner() — the single OWNER_EMAIL account. Not the host, not the
//     creator, not an admin-token holder. No client input feeds this decision.
//   * status !== "completed" — finished tournaments are the record that the
//     power rankings are computed from, so they are not deletable here.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const owner = await requireOwner();

    const limited = await enforceRateLimits(req, [
      {
        name: "tournament-delete-ip",
        key: clientIpKey(req),
        limit: 20,
        windowSec: 600,
        message: "Too many delete attempts. Try again later.",
      },
      {
        name: "tournament-delete-owner",
        key: rateLimitKey("owner", owner.id),
        limit: 20,
        windowSec: 600,
        message: "Too many delete attempts. Try again later.",
      },
    ]);
    if (limited) return limited;

    const supabase = createServiceClient();
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id, name, status")
      .eq("id", params.id)
      .single<Pick<Tournament, "id" | "name" | "status">>();
    if (!tournament) throw new HttpError(404, "Tournament not found.");

    if (tournament.status === "completed") {
      throw new HttpError(
        409,
        "Completed tournaments can't be deleted — their results feed the power rankings."
      );
    }

    // The schema cascades from tournaments, but delete the children explicitly
    // and in FK-safe order so this works even against a database where the
    // cascade is missing, and so a partial failure is reported rather than
    // silently leaving orphans.
    for (const table of ["results", "matches", "participants", "tournament_secrets"] as const) {
      const { error } = await supabase.from(table).delete().eq("tournament_id", params.id);
      if (error) throw new HttpError(500, `Could not delete the tournament's ${table}.`);
    }

    const { error } = await supabase.from("tournaments").delete().eq("id", params.id);
    if (error) throw new HttpError(500, "Could not delete the tournament.");

    console.info(`[owner-delete] ${owner.email} deleted tournament ${tournament.id} (${tournament.name})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
