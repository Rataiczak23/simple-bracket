import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { applyWinner, correctWinner } from "@/lib/bracket";
import { computeResults } from "@/lib/rankings";
import type { Match, Participant } from "@/lib/types";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/matches/[matchId]/winner  { winnerId } -> record a result and advance.
export async function POST(req: Request, { params }: { params: { matchId: string } }) {
  try {
    const { winnerId } = await req.json();
    if (typeof winnerId !== "string" || !winnerId) {
      throw new HttpError(400, "winnerId is required.");
    }

    const supabase = createServiceClient();
    const adminToken = tokenFromRequest(req);
    const limited = await enforceRateLimits(req, [
      {
        name: "match-winner-ip",
        key: clientIpKey(req),
        limit: 120,
        windowSec: 60,
        message: "Too many winner updates. Slow down and try again.",
      },
      {
        name: "match-winner-admin",
        key: adminToken ? rateLimitKey("admin", adminToken) : null,
        limit: 240,
        windowSec: 300,
        message: "Too many winner updates. Slow down and try again.",
      },
    ]);
    if (limited) return limited;

    // Find which tournament this match belongs to, then authorize.
    const { data: target } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", params.matchId)
      .single<{ tournament_id: string }>();
    if (!target) throw new HttpError(404, "Match not found.");

    // A matchup can be advanced by the tournament host (admin token) or by any
    // signed-in user who is a participant in THIS tournament. This lets players
    // run the bracket from the public view without exposing it to strangers or
    // to signed-in users who never joined.
    const user = await getCurrentUser();
    let allowed = false;
    if (user) {
      const { data: participant } = await supabase
        .from("participants")
        .select("id")
        .eq("tournament_id", target.tournament_id)
        .eq("user_id", user.id)
        .maybeSingle();
      allowed = Boolean(participant);
    }
    if (!allowed) {
      await assertAdmin(supabase, target.tournament_id, adminToken);
    }

    const { data: matches } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", target.tournament_id)
      .returns<Match[]>();
    if (!matches) throw new HttpError(500, "Could not load the bracket.");

    const current = matches.find((m) => m.id === params.matchId);
    if (!current) throw new HttpError(404, "Match not found.");
    const alreadyDecided = current.winner_id !== null || current.is_bye;

    // Re-picking the same winner is a no-op; nothing to save.
    if (alreadyDecided && current.winner_id === winnerId) {
      return NextResponse.json({ ok: true, champion: winnerId, unchanged: true });
    }

    const before = new Map(matches.map((m) => [m.id, JSON.stringify(m)]));
    // A fresh match records a winner and advances; an already-decided match is
    // being corrected (misclick), which reopens everything it fed downstream.
    const { matches: updated, champion } = alreadyDecided
      ? correctWinner(matches, params.matchId, winnerId)
      : applyWinner(matches, params.matchId, winnerId);

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

      // Save standings for the power rankings.
      const { data: participants } = await supabase
        .from("participants")
        .select("*")
        .eq("tournament_id", target.tournament_id)
        .returns<Participant[]>();
      const results = computeResults(participants ?? [], updated, champion).map((r) => ({
        ...r,
        tournament_id: target.tournament_id,
      }));
      if (results.length > 0) {
        await supabase.from("results").upsert(results, { onConflict: "tournament_id,user_id" });
      }
    } else {
      // A correction may have undone a previously-crowned champion. If so, roll
      // the tournament back to in_progress and drop the now-stale standings so
      // the power rankings don't keep counting a result that no longer stands.
      const { data: t } = await supabase
        .from("tournaments")
        .select("status")
        .eq("id", target.tournament_id)
        .single<{ status: string }>();
      if (t?.status === "completed") {
        await supabase
          .from("tournaments")
          .update({ status: "in_progress", winner_id: null })
          .eq("id", target.tournament_id);
        await supabase.from("results").delete().eq("tournament_id", target.tournament_id);
      }
    }

    return NextResponse.json({ ok: true, champion: champion ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
