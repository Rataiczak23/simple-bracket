import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { applyWinner } from "@/lib/bracket";
import type { Match } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/matches/[matchId]/winner  { winnerId } -> record a result and advance.
export async function POST(req: Request, { params }: { params: { matchId: string } }) {
  try {
    const { winnerId } = await req.json();
    if (typeof winnerId !== "string" || !winnerId) {
      throw new HttpError(400, "winnerId is required.");
    }

    const supabase = createServiceClient();

    // Find which tournament this match belongs to, then authorize.
    const { data: target } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", params.matchId)
      .single<{ tournament_id: string }>();
    if (!target) throw new HttpError(404, "Match not found.");

    await assertAdmin(supabase, target.tournament_id, tokenFromRequest(req));

    const { data: matches } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", target.tournament_id)
      .returns<Match[]>();
    if (!matches) throw new HttpError(500, "Could not load the bracket.");

    const before = new Map(matches.map((m) => [m.id, JSON.stringify(m)]));
    const { matches: updated, champion } = applyWinner(matches, params.matchId, winnerId);

    // Persist only the matches that actually changed.
    const changed = updated.filter((m) => before.get(m.id) !== JSON.stringify(m));
    if (changed.length > 0) {
      const { error } = await supabase.from("matches").upsert(changed);
      if (error) throw new HttpError(500, "Could not save the result.");
    }

    if (champion) {
      await supabase
        .from("tournaments")
        .update({ status: "completed", winner_id: champion })
        .eq("id", target.tournament_id);
    }

    return NextResponse.json({ ok: true, champion: champion ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
