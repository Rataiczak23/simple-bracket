import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, HttpError, errorResponse, tokenFromRequest } from "@/lib/admin";
import { addLateEntrant, generateBracket, openByeSlots } from "@/lib/bracket";
import type { Match, Participant, Tournament } from "@/lib/types";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Fisher-Yates shuffle (in place) using unbiased crypto randomness. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * POST /api/tournaments/[id]/late-entry   { email, mode? }
 *
 * Add a player to a tournament that has ALREADY started. Host-only — there is
 * no self-join path here, because slotting a latecomer into a live bracket is
 * an organizer's call. Two modes:
 *   - "slot" (default): drop the player into an open bye spot. Non-destructive;
 *     every played result stands. Fails with 409 if the bracket has no such
 *     spot left (a full power-of-2 field, or every bye already played on).
 *   - "rebuild": regenerate the whole bracket with the new player included.
 *     Clears all results, so the client must ask first.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    const body = await req.json().catch(() => ({}));
    const adminToken = tokenFromRequest(req);

    const limited = await enforceRateLimits(req, [
      {
        name: "participants-late-ip",
        key: clientIpKey(req),
        limit: 20,
        windowSec: 600,
        message: "Too many late-entry attempts. Slow down and try again.",
      },
      {
        name: "participants-late-admin",
        key: adminToken ? rateLimitKey("admin", adminToken) : null,
        limit: 20,
        windowSec: 600,
        message: "Too many late-entry attempts. Slow down and try again.",
      },
    ]);
    if (limited) return limited;

    await assertAdmin(supabase, params.id, adminToken);

    const mode = body.mode === "rebuild" ? "rebuild" : "slot";

    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", params.id)
      .single<Tournament>();
    if (tErr || !tournament) throw new HttpError(404, "Tournament not found.");
    if (tournament.status === "setup") {
      throw new HttpError(409, "This tournament hasn't started — add players the normal way.");
    }
    if (tournament.status === "completed") {
      throw new HttpError(
        409,
        "This tournament is finished. Reset the bracket first if you want to re-run it."
      );
    }

    // Resolve the account to add (host adds by email, same as during setup).
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) throw new HttpError(400, "Enter the player's account email.");
    const { data: user } = await supabase
      .from("users")
      .select("id, display_name")
      .eq("email", email)
      .maybeSingle<{ id: string; display_name: string }>();
    if (!user) throw new HttpError(404, "No account found with that email.");

    const { data: dupe } = await supabase
      .from("participants")
      .select("id")
      .eq("tournament_id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (dupe) throw new HttpError(409, "That player is already in this tournament.");

    const { count } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", params.id);
    if ((count ?? 0) >= 128) throw new HttpError(409, "Entry limit reached (128).");

    // Slot mode works against the live bracket; rebuild throws it away anyway.
    let matches: Match[] = [];
    let openSlots: ReturnType<typeof openByeSlots> = [];
    if (mode === "slot") {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", params.id)
        .returns<Match[]>();
      if (!data || data.length === 0) throw new HttpError(500, "Could not load the bracket.");
      matches = data;

      // Check there's somewhere to put them BEFORE creating the participant, so
      // a refusal doesn't leave a player stranded outside the bracket.
      openSlots = openByeSlots(matches);
      if (openSlots.length === 0) {
        return NextResponse.json(
          {
            error:
              "No open spot left in this bracket. Adding a player now means rebuilding it, which clears every result.",
            canRebuild: true,
          },
          { status: 409 }
        );
      }
    }

    const { data: participant, error: pErr } = await supabase
      .from("participants")
      .insert({ tournament_id: params.id, user_id: user.id, name: user.display_name })
      .select("*")
      .single<Participant>();
    if (pErr || !participant) throw new HttpError(500, "Could not add the player.");

    /** Undo the insert so a failed placement doesn't leave a phantom entrant. */
    const rollbackParticipant = async () => {
      await supabase.from("participants").delete().eq("id", participant.id);
    };

    if (mode === "slot") {
      // Pick among the open byes at random — the same fairness reason the
      // initial seeding is shuffled rather than taken in join order.
      const target = openSlots[randomInt(openSlots.length)];
      const before = new Map(matches.map((m) => [m.id, JSON.stringify(m)]));

      let updated: Match[];
      try {
        updated = addLateEntrant(matches, participant.id, target).matches;
      } catch (err) {
        await rollbackParticipant();
        throw new HttpError(409, err instanceof Error ? err.message : "Could not place the player.");
      }

      const changed = updated.filter((m) => before.get(m.id) !== JSON.stringify(m));
      if (changed.length > 0) {
        const { error } = await supabase.from("matches").upsert(changed);
        if (error) {
          await rollbackParticipant();
          throw new HttpError(500, "Could not update the bracket.");
        }
      }

      return NextResponse.json({
        ok: true,
        mode,
        participant,
        matchId: target.matchId,
      });
    }

    // Rebuild: same bracket-from-scratch path as start, with the fuller field.
    const { data: roster } = await supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", params.id)
      .returns<Participant[]>();
    if (!roster || roster.length < 2) {
      await rollbackParticipant();
      throw new HttpError(400, "Need at least 2 players to rebuild the bracket.");
    }

    const rebuilt = generateBracket(params.id, tournament.format, shuffle([...roster]));

    const { error: dErr } = await supabase.from("matches").delete().eq("tournament_id", params.id);
    if (dErr) {
      await rollbackParticipant();
      throw new HttpError(500, "Could not clear the old bracket.");
    }
    await supabase.from("results").delete().eq("tournament_id", params.id);

    const { error: mErr } = await supabase.from("matches").insert(rebuilt);
    if (mErr) {
      // The old bracket is already gone, so park the tournament back in setup —
      // the host can press Start to generate a fresh one.
      await supabase
        .from("tournaments")
        .update({ status: "setup", winner_id: null })
        .eq("id", params.id);
      throw new HttpError(
        500,
        "The old bracket was cleared but the new one failed to save. The player was added — press Start to generate the bracket."
      );
    }

    if (tournament.winner_id !== null) {
      await supabase.from("tournaments").update({ winner_id: null }).eq("id", params.id);
    }

    return NextResponse.json({ ok: true, mode, participant });
  } catch (err) {
    return errorResponse(err);
  }
}
