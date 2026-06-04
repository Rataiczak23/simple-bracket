import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError, errorResponse } from "@/lib/admin";

export const runtime = "nodejs";

// POST /api/tournaments/[id]/participants  { name } -> guest join (setup only).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { name } = await req.json();
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) throw new HttpError(400, "Your name is required.");
    if (cleanName.length > 40) throw new HttpError(400, "Name too long (max 40 chars).");

    const supabase = createServiceClient();

    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id, status")
      .eq("id", params.id)
      .single();
    if (tErr || !tournament) throw new HttpError(404, "Tournament not found.");
    if (tournament.status !== "setup") {
      throw new HttpError(409, "This tournament has already started — no more entries.");
    }

    const { count } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", params.id);
    if ((count ?? 0) >= 128) throw new HttpError(409, "Entry limit reached (128).");

    const { data: participant, error: pErr } = await supabase
      .from("participants")
      .insert({ tournament_id: params.id, name: cleanName })
      .select("*")
      .single();
    if (pErr || !participant) throw new HttpError(500, "Could not add you to the tournament.");

    return NextResponse.json(participant);
  } catch (err) {
    return errorResponse(err);
  }
}
