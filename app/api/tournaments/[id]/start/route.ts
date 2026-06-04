import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";
import { generateBracket } from "@/lib/bracket";
import type { Participant, Tournament } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/tournaments/[id]/start -> generate the bracket and lock entries.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    await assertAdmin(supabase, params.id, tokenFromRequest(req));

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
      .order("created_at", { ascending: true })
      .returns<Participant[]>();

    if (!participants || participants.length < 2) {
      throw new HttpError(400, "Need at least 2 players to start.");
    }

    const matches = generateBracket(params.id, tournament.format, participants);

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
