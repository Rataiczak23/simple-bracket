import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { generateBracket } from "@/lib/bracket";
import type { Participant, Tournament } from "@/lib/types";
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

// POST /api/tournaments/[id]/start -> generate the bracket and lock entries.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    const adminToken = tokenFromRequest(req);
    const limited = await enforceRateLimits(req, [
      {
        name: "tournament-start-ip",
        key: clientIpKey(req),
        limit: 10,
        windowSec: 300,
        message: "Too many start attempts. Try again in a few minutes.",
      },
      {
        name: "tournament-start-admin",
        key: adminToken ? rateLimitKey("admin", adminToken) : null,
        limit: 10,
        windowSec: 300,
        message: "Too many start attempts. Try again in a few minutes.",
      },
    ]);
    if (limited) return limited;

    await assertAdmin(supabase, params.id, adminToken);

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", params.id)
      .single<Tournament>();
    if (!tournament) throw new HttpError(404, "Tournament not found.");
    if (tournament.status !== "setup") {
      throw new HttpError(409, "Tournament has already started.");
    }

    const { data: participants } = await supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", params.id)
      .returns<Participant[]>();

    if (!participants || participants.length < 2) {
      throw new HttpError(400, "Need at least 2 players to start.");
    }

    // Randomize seeding so join order doesn't decide the bracket. Without this,
    // participant index maps straight to seed number, meaning the first players
    // to join would always draw the byes (and the softest early matchups).
    const seeded = shuffle([...participants]);

    const matches = generateBracket(params.id, tournament.format, seeded);

    const { error: mErr } = await supabase.from("matches").insert(matches);
    if (mErr) throw new HttpError(500, "Could not generate the bracket.");

    const { error: uErr } = await supabase
      .from("tournaments")
      .update({ status: "in_progress" })
      .eq("id", params.id);
    if (uErr) {
      await supabase.from("matches").delete().eq("tournament_id", params.id);
      throw new HttpError(500, "Could not start the tournament.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
